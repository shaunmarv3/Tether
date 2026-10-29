// scrcpy windows. M1: the Mirror window only.
import type { ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { isSerial } from './devices'
import type { EnginePaths } from './engine'
import { start } from './run'

export function mirrorArgs(serial: string, title: string): string[] {
  if (!isSerial(serial)) throw new Error(`bad serial: ${serial}`)
  return ['-s', serial, '--turn-screen-off', '--keep-active', `--window-title=${title}`]
}

export class Sessions extends EventEmitter {
  private open = new Map<string, ChildProcess>()
  lastError: string | null = null

  constructor(private spawnFn: typeof start = start) {
    super()
  }

  openMirror(engine: EnginePaths, serial: string, title: string): void {
    if (this.open.has(serial)) return
    const child = this.spawnFn(engine.scrcpy, mirrorArgs(serial, title), { env: { ...process.env, ADB: engine.adb } })
    let lastLine = ''
    child.stderr?.on('data', (d: Buffer) => {
      const lines = d.toString().split(/\r?\n/).filter(Boolean)
      if (lines.length) lastLine = lines[lines.length - 1]
    })
    const done = (error: string | null) => {
      if (this.open.get(serial) !== child) return
      this.open.delete(serial)
      this.lastError = error
      this.emit('change')
    }
    child.on('exit', (code) => done(code === 0 ? null : lastLine || `scrcpy exited with code ${code}`))
    child.on('error', (err) => done(err.message))
    this.open.set(serial, child)
    this.lastError = null
    this.emit('change')
  }

  isOpen(serial: string): boolean {
    return this.open.has(serial)
  }

  closeAll(): void {
    for (const child of this.open.values()) child.kill()
  }
}
