// Installed apps, via `scrcpy --list-apps` (it pushes its own server and prints one app per line).
import type { EnginePaths } from './engine'
import { isSerial } from './devices'
import { run } from './run'

export interface PhoneApp { name: string; pkg: string; system: boolean }

export function isPackage(s: unknown): s is string {
  return typeof s === 'string' && s.length <= 255 && /^[a-zA-Z0-9_.]+$/.test(s)
}

// Lines: " * Name<padding> package" (system) or " - Name…" (user); a long name puts the package on the next line.
export function parseApps(out: string): PhoneApp[] {
  const apps: PhoneApp[] = []
  const lines = out.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const m = /^ ([*-]) (.+)$/.exec(lines[i])
    if (!m) continue
    let name = m[2].trimEnd()
    let pkg: string
    const sameLine = /^(.*?) {2,}(\S+)$/.exec(name)
    if (sameLine) [, name, pkg] = sameLine
    else pkg = lines[++i]?.trim() ?? ''
    if (isPackage(pkg)) apps.push({ name, pkg, system: m[1] === '*' })
  }
  return apps.sort((a, b) => a.name.localeCompare(b.name) || a.pkg.localeCompare(b.pkg))
}

export async function listApps(engine: EnginePaths, serial: string): Promise<PhoneApp[]> {
  if (!isSerial(serial)) throw new Error(`bad serial: ${serial}`)
  const r = await run(engine.scrcpy, ['-s', serial, '--list-apps'], { env: { ...process.env, ADB: engine.adb }, timeoutMs: 30_000 })
  const apps = parseApps(`${r.stdout}\n${r.stderr}`)
  if (!apps.length) throw new Error(r.stderr.trim().split(/\r?\n/).pop() || 'no apps found')
  return apps
}
