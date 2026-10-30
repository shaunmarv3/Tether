// Lockdown (rule 5): close every phone window, turn off Wireless debugging, drop Wi-Fi links.
// Order matters: the Wi-Fi-off command needs a link to travel on, so disconnect comes last.
import { isSerial, type Device } from './devices'
import { run } from './run'

export async function disableWirelessDebugging(adb: string, serial: string): Promise<void> {
  if (!isSerial(serial)) throw new Error(`bad serial: ${serial}`)
  const r = await run(adb, ['-s', serial, 'shell', 'settings', 'put', 'global', 'adb_wifi_enabled', '0'])
  if (r.code !== 0) throw new Error(r.stderr.trim() || 'settings put failed')
}

export async function lockdown(adb: string, views: { closeAll(): number }, devices: Device[]): Promise<{ wifiOffFailed: string[] }> {
  views.closeAll()
  const wifiOffFailed: string[] = []
  for (const d of devices.filter((d) => d.state === 'device')) {
    try {
      await disableWirelessDebugging(adb, d.serial)
    } catch {
      wifiOffFailed.push(d.serial)
    }
  }
  await run(adb, ['disconnect']).catch(() => undefined)
  return { wifiOffFailed }
}
