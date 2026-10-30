// TETHER's own scrcpy client: runs the official scrcpy-server on the phone and reads its sockets.
// Steps (scrcpy 5.0): push server → adb forward → start server → connect video/audio/control in that order.
import type { ChildProcess } from 'node:child_process'
import { randomInt } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { connect, type Socket } from 'node:net'
import { dirname, join } from 'node:path'
import { isSerial } from './devices'
import type { EnginePaths } from './engine'
import { DeviceReader, serverArgs, StreamReader, type ServerOptions } from './protocol'
import { run, start } from './run'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

// The first socket gets one dummy byte once the server really listens (a forward connect succeeds before that).
function connectFirst(port: number): Promise<{ socket: Socket; rest: Buffer } | null> {
  return new Promise((resolve) => {
    const s = connect(port, '127.0.0.1')
    s.once('data', (d: Buffer) => { s.pause(); s.removeAllListeners(); resolve({ socket: s, rest: d.subarray(1) }) })
    s.once('error', () => { s.destroy(); resolve(null) })
    s.once('close', () => resolve(null))
  })
}

function connectNext(port: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = connect(port, '127.0.0.1')
    s.once('connect', () => { s.removeAllListeners(); resolve(s) })
    s.once('error', reject)
  })
}

// Forwards left behind when TETHER was killed (no clean close): `adb forward --list` lines for scrcpy sockets.
export function parseScrcpyForwards(out: string): { serial: string; port: number }[] {
  return out.split(/\r?\n/).flatMap((line) => {
    const m = /^(\S+) tcp:(\d+) localabstract:scrcpy_[0-9a-f]{8}$/.exec(line.trim())
    return m && isSerial(m[1]) ? [{ serial: m[1], port: Number(m[2]) }] : []
  })
}

export async function removeStaleForwards(adb: string): Promise<number> {
  const stale = parseScrcpyForwards((await run(adb, ['forward', '--list'])).stdout)
  for (const f of stale) await run(adb, ['-s', f.serial, 'forward', '--remove', `tcp:${f.port}`]).catch(() => undefined)
  return stale.length
}

// Events: 'video' (StreamEvent), 'audio' (StreamEvent), 'device' (DeviceEvent: phone clipboard…), 'log' (server WARN/ERROR line), 'close' (error: string | null, once).
export class PhoneStream extends EventEmitter {
  private readonly scid = randomInt(0, 0x7fffffff).toString(16).padStart(8, '0')
  private sockets: Socket[] = []
  private control: Socket | null = null
  private server: ChildProcess | null = null
  private port: number | null = null
  private closed = false
  private lastLine = ''

  constructor(private engine: EnginePaths, private serial: string, private opts: Omit<ServerOptions, 'scid'>) {
    super()
    if (!isSerial(serial)) throw new Error(`bad serial: ${serial}`)
  }

  async start(): Promise<void> {
    try {
      await this.open()
    } catch (err) {
      this.close(this.lastLine || (err as Error).message)
      throw err
    }
  }

  private async open(): Promise<void> {
    const { adb } = this.engine
    const args = serverArgs({ ...this.opts, scid: this.scid })
    // Own copy per stream: the server deletes its jar right after it starts (scrcpy CleanUp.unlinkSelf),
    // so streams starting together can't share one file.
    const remote = `/data/local/tmp/scrcpy-server-${this.scid}.jar`
    const push = await run(adb, ['-s', this.serial, 'push', join(dirname(this.engine.scrcpy), 'scrcpy-server'), remote])
    if (push.code !== 0) throw new Error(push.stderr.trim() || 'could not copy the server to the phone')
    const fwd = await run(adb, ['-s', this.serial, 'forward', 'tcp:0', `localabstract:scrcpy_${this.scid}`])
    this.port = Number.parseInt(fwd.stdout.trim(), 10)
    if (fwd.code !== 0 || !this.port) throw new Error(fwd.stderr.trim() || 'adb forward failed')
    if (this.closed) throw new Error('closed')

    const server = start(adb, ['-s', this.serial, 'shell', `CLASSPATH=${remote}`, 'app_process', '/', 'com.genymobile.scrcpy.Server', ...args])
    this.server = server
    const keepLast = (d: Buffer) => {
      const lines = d.toString().split(/\r?\n/).filter(Boolean)
      if (lines.length) this.lastLine = lines[lines.length - 1]
      for (const l of lines) if (/WARN|ERROR/.test(l)) this.emit('log', l)
    }
    server.stdout?.on('data', keepLast)
    server.stderr?.on('data', keepLast)
    server.on('exit', () => this.close(this.lastLine || 'phone server stopped'))
    server.on('error', (err) => this.close(err.message))

    // A locked, dozing phone can take several seconds to start the server: wait up to 15 s.
    let first: { socket: Socket; rest: Buffer } | null = null
    for (const end = Date.now() + 15_000; Date.now() < end && !first && !this.closed;) {
      first = await connectFirst(this.port)
      if (!first) await wait(100)
    }
    if (!first) throw new Error(this.lastLine || 'phone server did not answer')

    const kinds = (['video', 'audio', 'control'] as const).filter((k) => this.opts[k])
    for (const [i, kind] of kinds.entries()) {
      const socket = i === 0 ? first.socket : await connectNext(this.port)
      this.sockets.push(socket)
      socket.on('close', () => this.close(this.closed ? null : this.lastLine || 'phone stream ended'))
      socket.on('error', () => undefined) // 'close' follows
      if (kind === 'control') {
        this.control = socket
        const reader = new DeviceReader()
        const onData = (d: Buffer) => {
          try {
            for (const e of reader.feed(d)) this.emit('device', e)
          } catch (err) {
            this.close((err as Error).message)
          }
        }
        if (i === 0 && first.rest.length) onData(first.rest)
        socket.on('data', onData)
      } else {
        const reader = new StreamReader({ session: kind === 'video' })
        const onData = (d: Buffer) => { for (const e of reader.feed(d)) this.emit(kind, e) }
        if (i === 0 && first.rest.length) onData(first.rest)
        socket.on('data', onData)
      }
      socket.resume()
    }
  }

  send(msg: Uint8Array): boolean {
    if (this.closed || !this.control) return false
    this.control.write(msg)
    return true
  }

  close(error: string | null = null): void {
    if (this.closed) return
    this.closed = true
    for (const s of this.sockets) s.destroy()
    this.server?.kill()
    if (this.port) void run(this.engine.adb, ['-s', this.serial, 'forward', '--remove', `tcp:${this.port}`]).catch(() => undefined)
    this.emit('close', error)
  }
}
