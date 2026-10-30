// Which phone is "ours". Phones are remembered by ro.serialno, which is the same over USB and Wi-Fi.
import { isSerial, type Device } from './devices'
import { run } from './run'

export interface KnownPhone { serialNo: string; name: string; addedAt: string } // addedAt: ISO date
export interface PhoneLink extends Device { serialNo: string | null; name: string | null } // null until read

// ro.serialno + the "About phone" name in one call. Constant command (rule 7).
export async function identify(adb: string, serial: string): Promise<{ serialNo: string; name: string }> {
  if (!isSerial(serial)) throw new Error(`bad serial: ${serial}`)
  const r = await run(adb, ['-s', serial, 'shell', 'getprop ro.serialno; settings get global device_name'])
  const [sn = '', name = ''] = r.stdout.split(/\r?\n/).map((l) => l.trim())
  if (r.code !== 0 || !isSerial(sn)) throw new Error(r.stderr.trim() || 'could not read ro.serialno')
  return { serialNo: sn, name: name && name !== 'null' ? name : sn }
}

export function pickPhone(links: PhoneLink[], known: KnownPhone[]): {
  current: PhoneLink | null; unknown: PhoneLink[]; pending: PhoneLink | null
} {
  const isKnown = (l: PhoneLink) => known.some((k) => k.serialNo === l.serialNo)
  const ready = links.filter((l) => l.state === 'device' && l.serialNo)
  const current = ready.filter(isKnown).sort((a, b) => (a.transport === 'usb' ? 0 : 1) - (b.transport === 'usb' ? 0 : 1))[0] ?? null
  const unknown = ready.filter((l, i) => !isKnown(l) && ready.findIndex((o) => o.serialNo === l.serialNo) === i)
  const pending = current ? null : links.find((l) => l.state !== 'device') ?? null
  return { current, unknown, pending }
}
