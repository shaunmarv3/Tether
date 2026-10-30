// Phone storage over plain adb. Every remote path is checked by isDevicePath and, for `adb shell`, quoted by shq (rule 7).
import { basename } from 'node:path'
import { isSerial } from './devices'
import { run, runToFile } from './run'

export interface RemoteEntry { name: string; dir: boolean; size: number; mtime: string } // mtime 'YYYY-MM-DDTHH:MM', phone time

const LONG = 3_600_000 // a big video can take a while over USB

export function shq(path: string): string {
  return `'${path.replaceAll("'", "'\\''")}'`
}

const SD_CARD = /^\/storage\/[0-9A-F]{4}-[0-9A-F]{4}\//

// Internal shared storage, or a removable SD card (/storage/XXXX-XXXX/).
export function isDevicePath(p: unknown): p is string {
  return typeof p === 'string' && p.length <= 4096
    && (p.startsWith('/sdcard/') || p.startsWith('/storage/emulated/0/') || SD_CARD.test(p))
    && !/[\0\r\n]/.test(p) && !p.split('/').includes('..')
}

function check(serial: string, paths: string[]): void {
  if (!isSerial(serial)) throw new Error(`bad serial: ${serial}`)
  for (const p of paths) if (!isDevicePath(p)) throw new Error(`bad phone path: ${p}`)
}

const shell = (adb: string, serial: string, cmd: string) => run(adb, ['-s', serial, 'shell', cmd])

// toybox `ls -la`: perms links owner group size YYYY-MM-DD HH:MM name (symlinks: 'name -> target').
export function parseLs(out: string): RemoteEntry[] {
  const entries: RemoteEntry[] = []
  for (const line of out.split('\n')) {
    const m = /^([-dlcbps])\S*\s+\d+\s+\S+\s+\S+\s+(\d+)\s+(\d{4}-\d\d-\d\d) (\d\d:\d\d) (.+)$/.exec(line.replace(/\r$/, ''))
    if (!m) continue
    const name = m[1] === 'l' ? m[5].replace(/ -> .*$/, '') : m[5]
    if (name === '.' || name === '..') continue
    entries.push({ name, dir: m[1] === 'd', size: Number(m[2]), mtime: `${m[3]}T${m[4]}` })
  }
  return entries
}

export async function listDir(adb: string, serial: string, dir: string): Promise<RemoteEntry[]> {
  check(serial, [dir])
  const r = await shell(adb, serial, `ls -la ${shq(dir)}`)
  if (r.code !== 0) throw new Error(/No such file/.test(r.stderr) ? 'FOLDER NOT FOUND' : r.stderr.trim() || 'could not list the folder')
  return parseLs(r.stdout).sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name))
}

export async function countPlaces(adb: string, serial: string, dirs: string[]): Promise<(number | null)[]> {
  check(serial, dirs)
  const cmd = dirs.map((d) => `if [ -d ${shq(d)} ]; then ls -1 ${shq(d)} | wc -l; else echo -; fi`).join('; ')
  const lines = (await shell(adb, serial, cmd)).stdout.split(/\r?\n/)
  return dirs.map((_, i) => (/^\s*\d+\s*$/.test(lines[i] ?? '') ? Number(lines[i]) : null))
}

export async function pushFiles(adb: string, serial: string, locals: string[], dir: string): Promise<{ sent: number; failed: string[] }> {
  check(serial, [dir])
  const failed: string[] = []
  const base = dir.replace(/\/$/, '')
  for (const f of locals) {
    const r = await run(adb, ['-s', serial, 'push', f, `${base}/`], { timeoutMs: LONG }).catch(() => null)
    if (r?.code !== 0) failed.push(f)
  }
  // adb keeps the PC file's date, which buries a new file in the phone's file apps: date it now.
  // A file written by adb also stays hidden as "pending" in Android's media index (~2 min seen on Android 16)
  // until it is scanned, so ask the media scanner for each one.
  const sent = locals.filter((f) => !failed.includes(f)).map((f) => `${base}/${basename(f)}`).filter(isDevicePath)
  const scans = sent.map((p) => `am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d ${shq(scanUri(p))} >/dev/null`)
  if (sent.length) await shell(adb, serial, [`touch -c -- ${sent.map(shq).join(' ')}`, ...scans].join('; ')).catch(() => undefined)
  return { sent: locals.length - failed.length, failed }
}

// file:// URI for the media scanner: the real volume path (not the /sdcard link), each name part encoded.
function scanUri(path: string): string {
  const real = path.replace(/^\/sdcard\//, '/storage/emulated/0/')
  return `file://${real.split('/').map(encodeURIComponent).join('/')}`
}

// Removable SD cards, as roots like '/storage/6137-3639/'.
export async function sdCards(adb: string, serial: string): Promise<string[]> {
  check(serial, [])
  const out = (await shell(adb, serial, 'ls /storage')).stdout
  return out.split(/\r?\n/).filter((n) => /^[0-9A-F]{4}-[0-9A-F]{4}$/.test(n)).map((n) => `/storage/${n}/`)
}

export async function pullFiles(adb: string, serial: string, remotes: string[], localDir: string): Promise<{ saved: number; failed: string[] }> {
  check(serial, remotes)
  const failed: string[] = []
  for (const p of remotes) {
    const r = await run(adb, ['-s', serial, 'pull', p, localDir], { timeoutMs: LONG }).catch(() => null)
    if (r?.code !== 0) failed.push(p)
  }
  return { saved: remotes.length - failed.length, failed }
}

export async function removeFiles(adb: string, serial: string, paths: string[]): Promise<void> {
  check(serial, paths)
  const r = await shell(adb, serial, `rm -f -- ${paths.map(shq).join(' ')}`)
  if (r.code !== 0) throw new Error(r.stderr.trim() || 'could not delete')
}

export async function makeDir(adb: string, serial: string, path: string): Promise<void> {
  check(serial, [path])
  const r = await shell(adb, serial, `mkdir ${shq(path)}`)
  if (r.code !== 0) throw new Error(/exists/.test(r.stderr) ? 'ALREADY EXISTS' : r.stderr.trim() || 'could not make the folder')
}

export async function installApk(adb: string, serial: string, apk: string): Promise<void> {
  check(serial, [])
  const r = await run(adb, ['-s', serial, 'install', '-r', apk], { timeoutMs: 300_000 })
  if (/^Success/m.test(r.stdout)) return
  const reason = /Failure \[([^\]]+)\]/.exec(r.stdout + r.stderr)?.[1]
  throw new Error(`INSTALL FAILED · ${reason ?? (r.stderr.trim() || 'UNKNOWN')}`)
}

export async function screenshot(adb: string, serial: string, file: string): Promise<void> {
  check(serial, [])
  const r = await runToFile(adb, ['-s', serial, 'exec-out', 'screencap', '-p'], file)
  if (r.code !== 0) throw new Error(r.stderr.trim() || 'screenshot failed')
}
