// Live phone status for the Home LCD: one adb shell call + one round-trip timing.
import { isSerial } from './devices'
import { run } from './run'

export interface DeviceStatus {
  model: string; android: string; nothingOs: string | null; batteryPct: number | null
  storageUsedGb: number | null; storageTotalGb: number | null; latencyMs: number
}

// Constant command, no user input in it, so rule 7 holds. device_name is the "About phone"
// name (model is just a code like A015). /data may report its mount as /data/user/0.
export const STATUS_SHELL = 'settings get global device_name; echo @@; getprop ro.product.model; echo @@; '
  + 'getprop ro.build.version.release; echo @@; getprop ro.nothing.version.id; echo @@; dumpsys battery; echo @@; df -k /data'

export function parseStatus(out: string): Omit<DeviceStatus, 'latencyMs'> {
  const [name = '', model = '', android = '', nothingOs = '', battery = '', df = ''] =
    out.replace(/\r/g, '').split(/^@@$/m).map((b) => b.trim())
  const level = /^\s*level:\s*(\d+)/m.exec(battery)
  const cols = df.split('\n').slice(1).pop()?.trim().split(/\s+/)
  const gb = (kb: string | undefined) => (kb && /^\d+$/.test(kb) ? Math.round(Number(kb) / 1024 ** 2) : null)
  return {
    model: name && name !== 'null' ? name : model,
    android,
    nothingOs: nothingOs || null,
    batteryPct: level ? Number(level[1]) : null,
    storageUsedGb: gb(cols?.[2]),
    storageTotalGb: gb(cols?.[1]),
  }
}

export async function getStatus(adb: string, serial: string): Promise<DeviceStatus> {
  if (!isSerial(serial)) throw new Error(`bad serial: ${serial}`)
  const t0 = performance.now()
  const ping = await run(adb, ['-s', serial, 'shell', 'echo', 'ok'])
  const latencyMs = Math.round(performance.now() - t0)
  if (ping.code !== 0) throw new Error(ping.stderr.trim() || 'adb shell failed')
  const r = await run(adb, ['-s', serial, 'shell', STATUS_SHELL])
  if (r.code !== 0) throw new Error(r.stderr.trim() || 'adb shell failed')
  return { ...parseStatus(r.stdout), latencyMs }
}
