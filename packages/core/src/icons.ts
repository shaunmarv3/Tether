// Real app icons: a tiny dex (helper/IconDump.java) runs on the phone with app_process, the way scrcpy runs its
// server. Nothing is installed: it is pushed to /data/local/tmp, run once, and removed.
import { isPackage } from './apps'
import { isSerial } from './devices'
import { run } from './run'

export const ICON_JAR = '/data/local/tmp/tether-icons.jar'
const SIZE = 96 // px, enough for the 54 px Home tiles at 125 % scaling

// One line per package: "<package> <base64 png>" or "<package> -". Errors go to stderr, so other lines are skipped.
export function parseIcons(out: string): Record<string, Buffer | null> {
  const icons: Record<string, Buffer | null> = {}
  for (const line of out.split(/\r?\n/)) {
    const m = /^([a-zA-Z0-9_.]+) ([A-Za-z0-9+/=]+|-)$/.exec(line.trim())
    if (m) icons[m[1]] = m[2] === '-' ? null : Buffer.from(m[2], 'base64')
  }
  return icons
}

// jar = the local resources/tether-icons.jar. Package names are checked, so the shell line holds no user input (rule 7).
export async function readIcons(adb: string, serial: string, jar: string, pkgs: string[]): Promise<Record<string, Buffer | null>> {
  if (!isSerial(serial)) throw new Error(`bad serial: ${serial}`)
  const bad = pkgs.find((p) => !isPackage(p))
  if (bad !== undefined) throw new Error(`bad package: ${bad}`)
  const push = await run(adb, ['-s', serial, 'push', jar, ICON_JAR])
  if (push.code !== 0) throw new Error(push.stderr.trim() || 'adb push failed')
  try {
    const r = await run(adb, ['-s', serial, 'shell', `CLASSPATH=${ICON_JAR} app_process / IconDump ${SIZE} ${pkgs.join(' ')}`], { timeoutMs: 120_000 })
    if (r.code !== 0) throw new Error(r.stderr.trim() || 'icon helper failed')
    return parseIcons(r.stdout)
  } finally {
    await run(adb, ['-s', serial, 'shell', 'rm', '-f', ICON_JAR]).catch(() => undefined)
  }
}
