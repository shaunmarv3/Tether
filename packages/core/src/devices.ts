// Finds phones via `adb devices -l`, polled (simpler than the track-devices wire format).
import { EventEmitter } from 'node:events'
import { run } from './run'

export type DeviceState = 'device' | 'unauthorized' | 'offline' | 'other'
export interface Device { serial: string; state: DeviceState; model: string | null; transport: 'usb' | 'wifi' }

export function isSerial(s: string): boolean {
  return /^[A-Za-z0-9._:-]+$/.test(s)
}

export function parseDevices(out: string): Device[] {
  const devices: Device[] = []
  for (const line of out.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith('*') || line.startsWith('List of devices')) continue
    const [serial, state, ...rest] = line.trim().split(/\s+/)
    const model = rest.find((f) => f.startsWith('model:'))?.slice(6).replace(/_/g, ' ') ?? null
    devices.push({
      serial,
      state: state === 'device' || state === 'unauthorized' || state === 'offline' ? state : 'other',
      model,
      transport: serial.includes(':') || serial.endsWith('._adb-tls-connect._tcp') ? 'wifi' : 'usb',
    })
  }
  return devices
}

export async function listDevices(adb: string): Promise<Device[]> {
  const r = await run(adb, ['devices', '-l'])
  if (r.code !== 0) throw new Error(r.stderr.trim() || 'adb devices failed')
  return parseDevices(r.stdout)
}

export class DeviceTracker extends EventEmitter {
  private timer: NodeJS.Timeout | null = null
  private last: string | null = null
  private busy = false

  constructor(private adb: string, private list: (adb: string) => Promise<Device[]> = listDevices) {
    super()
  }

  start(intervalMs = 2000): void {
    this.stop()
    void this.tick()
    this.timer = setInterval(() => void this.tick(), intervalMs)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private async tick(): Promise<void> {
    if (this.busy) return
    this.busy = true
    let devices: Device[]
    try {
      devices = await this.list(this.adb)
    } catch {
      devices = []
    } finally {
      this.busy = false
    }
    const key = JSON.stringify(devices)
    if (key === this.last) return
    this.last = key
    this.emit('change', devices)
  }
}
