// The phone's screen as text (uiautomator) and the AI pilot's hands (adb input). Constant commands + checked integers
// and packages only (rule 7).
import { isPackage } from './apps'
import { isSerial } from './devices'
import { run } from './run'

export interface UiNode {
  text: string; desc: string; id: string; cls: string; pkg: string
  bounds: [number, number, number, number] // left, top, right, bottom (phone pixels)
  clickable: boolean; editable: boolean; focused: boolean; password: boolean
}

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' }
const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|quot|apos|amp);/gi, (_, e: string) =>
  e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? Number.parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e.toLowerCase()])

export function parseUiDump(xml: string): UiNode[] | null {
  if (!xml.includes('<hierarchy')) return null
  const nodes: UiNode[] = []
  // Attributes come in double quotes, or single quotes when the value holds a `"` (a node missed here is invisible to the
  // guard).
  for (const m of xml.matchAll(/<node((?:\s+[\w-]+=(?:"[^"]*"|'[^']*'))*)\s*\/?>/g)) {
    const a: Record<string, string> = {}
    for (const [, k, dq, sq] of m[1].matchAll(/([\w-]+)=(?:"([^"]*)"|'([^']*)')/g)) a[k] = decode(dq ?? sq)
    const b = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/.exec(a.bounds ?? '')
    nodes.push({
      text: a.text ?? '', desc: a['content-desc'] ?? '', id: a['resource-id'] ?? '', cls: a.class ?? '', pkg: a.package ?? '',
      bounds: b ? [Number(b[1]), Number(b[2]), Number(b[3]), Number(b[4])] : [0, 0, 0, 0],
      clickable: a.clickable === 'true', editable: (a.class ?? '').endsWith('EditText'), focused: a.focused === 'true',
      password: a.password === 'true',
    })
  }
  return nodes
}

export function screenPackage(nodes: UiNode[]): string | null {
  return nodes[0]?.pkg || null
}

const area = (n: UiNode) => (n.bounds[2] - n.bounds[0]) * (n.bounds[3] - n.bounds[1])
const smallest = (list: UiNode[]) => list.reduce<UiNode | null>((best, n) => (!best || area(n) < area(best) ? n : best), null)

export function nodeAt(nodes: UiNode[], x: number, y: number): UiNode | null {
  const hit = nodes.filter(({ bounds: [l, t, r, b] }) => x >= l && x < r && y >= t && y < b)
  return smallest(hit.filter((n) => n.clickable)) ?? smallest(hit)
}

export function parseFocus(dumpsysWindow: string): string | null {
  return /mCurrentFocus=Window\{\S+ \S+ ([\w.]+)\//.exec(dumpsysWindow)?.[1] ?? null
}

// One line per node worth knowing about: `<Class> "text" [desc] id=<name> @x,y clickable editable focused`.
export function formatScreen(nodes: UiNode[]): string {
  return nodes.filter((n) => n.text || n.desc || n.clickable || n.editable).map((n) => {
    const text = n.password && n.text ? '•••' : n.text.replace(/\s*\n\s*/g, ' ')
    const [l, t, r, b] = n.bounds
    return [
      n.cls.split('.').pop(),
      text && `"${text}"`,
      n.desc && `[${n.desc.replace(/\s*\n\s*/g, ' ')}]`,
      n.id && `id=${n.id.split(':id/').pop()}`,
      `@${Math.round((l + r) / 2)},${Math.round((t + b) / 2)}`,
      n.clickable && 'clickable', n.editable && 'editable', n.focused && 'focused',
    ].filter(Boolean).join(' ')
  }).join('\n')
}

// --- adb ---

export type PhoneKey = 'back' | 'home' | 'enter'
const KEYCODES: Record<PhoneKey, number> = { back: 4, home: 3, enter: 66 }
const isCoord = (n: number) => Number.isInteger(n) && n >= 0 && n <= 10_000

async function shell(adb: string, serial: string, args: string[], what: string): Promise<string> {
  if (!isSerial(serial)) throw new Error(`bad serial: ${serial}`)
  const r = await run(adb, ['-s', serial, 'shell', ...args])
  if (r.code !== 0) throw new Error(r.stderr.trim() || `${what} failed`)
  return r.stdout
}

// null = no UI tree (a game or video that never goes idle, or uiautomator busy).
export async function dumpUi(adb: string, serial: string): Promise<UiNode[] | null> {
  if (!isSerial(serial)) throw new Error(`bad serial: ${serial}`)
  const r = await run(adb, ['-s', serial, 'exec-out', 'uiautomator', 'dump', '/dev/tty'], { timeoutMs: 10_000 })
  return r.code === 0 ? parseUiDump(r.stdout) : null
}

// A cheap "did the picture change" check for wait_for_change: the phone hashes its own screenshot, so only 32 characters
// cross the cable (a full dump takes 2–3 s). null when it fails.
export async function screenHash(adb: string, serial: string): Promise<string | null> {
  if (!isSerial(serial)) throw new Error(`bad serial: ${serial}`)
  const r = await run(adb, ['-s', serial, 'exec-out', 'screencap | md5sum'], { timeoutMs: 5000 })
  return r.code === 0 ? r.stdout.match(/^[0-9a-f]{32}\b/)?.[0] ?? null : null
}

export function parseKeyguard(dumpsysWindow: string): boolean {
  return /KeyguardServiceDelegate\s+showing=true/.test(dumpsysWindow)
}

// Visible PopupWindows (WhatsApp's reaction row, overflow menus): not focusable, so `uiautomator dump` never shows them.
// Bounds = the window's (x,y) from mAttrs + its requested size.
export interface Popup { pkg: string; bounds: [number, number, number, number] }
export function parsePopups(dumpsysWindow: string): Popup[] {
  return dumpsysWindow.split(/\n(?=\s*Window #\d+ )/).flatMap((w) => {
    const pos = /mAttrs=\{\((-?\d+),(-?\d+)\)/.exec(w)
    const size = /Requested w=(\d+) h=(\d+)/.exec(w)
    const pkg = /\spackage=([\w.]+)/.exec(w)
    if (!/^\s*Window #\d+ Window\{\S+ \S+ PopupWindow:/.test(w) || !/isVisible=true/.test(w) || !pos || !size || !pkg) return []
    const [x, y, wd, ht] = [pos[1], pos[2], size[1], size[2]].map(Number)
    return [{ pkg: pkg[1], bounds: [x, y, x + wd, y + ht] as Popup['bounds'] }]
  })
}

export async function windowState(adb: string, serial: string): Promise<{ focus: string | null; keyguard: boolean; popups: Popup[] }> {
  const out = await shell(adb, serial, ['dumpsys', 'window'], 'dumpsys window')
  return { focus: parseFocus(out), keyguard: parseKeyguard(out), popups: parsePopups(out) }
}

// The app in front and who started its task (the task's first intent `I=`, else its affinity `A=`), both from one
// `dumpsys activity activities` snapshot. A launcher stub's task keeps the stub's name while another app's screen runs
// in it (Gemini → the Google app).
export function parseTaskOwner(out: string): { pkg: string; owner: string } | null {
  const top = /topResumedActivity=ActivityRecord\{\S+ \S+ ([\w.]+)\/\S* t(\d+)\}/.exec(out)
  const task = top ? new RegExp(`Task\\{\\S+ #${top[2]} [^\\n]*`).exec(out)?.[0] ?? '' : ''
  const owner = /\bI=([\w.]+)\//.exec(task)?.[1] ?? /\bA=\d+:([\w.]+)/.exec(task)?.[1]
  return top && owner ? { pkg: top[1], owner } : null
}

export async function taskOwner(adb: string, serial: string): Promise<{ pkg: string; owner: string } | null> {
  return parseTaskOwner(await shell(adb, serial, ['dumpsys', 'activity', 'activities'], 'dumpsys activity'))
}

export async function tapAt(adb: string, serial: string, x: number, y: number): Promise<void> {
  if (!isCoord(x) || !isCoord(y)) throw new Error('bad position')
  await shell(adb, serial, ['input', 'tap', String(x), String(y)], 'tap')
}

export async function swipeOn(adb: string, serial: string, x1: number, y1: number, x2: number, y2: number): Promise<void> {
  if (![x1, y1, x2, y2].every(isCoord)) throw new Error('bad position')
  await shell(adb, serial, ['input', 'swipe', String(x1), String(y1), String(x2), String(y2), '300'], 'swipe')
}

export async function longPressAt(adb: string, serial: string, x: number, y: number): Promise<void> {
  if (!isCoord(x) || !isCoord(y)) throw new Error('bad position')
  await shell(adb, serial, ['input', 'swipe', String(x), String(y), String(x), String(y), '600'], 'long press')
}

// Empty the focused field in one call: MOVE_END, then DEL and FORWARD_DEL `chars` times each (MOVE_END only reaches the
// end of the cursor's line, so the forward deletes clear any lines below it).
export async function clearField(adb: string, serial: string, chars: number): Promise<void> {
  if (!Number.isInteger(chars) || chars < 0) throw new Error('bad length')
  const n = Math.min(chars, 2000)
  await shell(adb, serial, ['input', 'keyevent', '123', ...Array<string>(n).fill('67'), ...Array<string>(n).fill('112')], 'clear field')
}

export async function pressKey(adb: string, serial: string, key: PhoneKey): Promise<void> {
  if (!(key in KEYCODES)) throw new Error('bad key')
  await shell(adb, serial, ['input', 'keyevent', String(KEYCODES[key])], 'key')
}

export async function launchApp(adb: string, serial: string, pkg: string): Promise<void> {
  if (!isPackage(pkg)) throw new Error(`bad package: ${pkg}`)
  await shell(adb, serial, ['monkey', '-p', pkg, '-c', 'android.intent.category.LAUNCHER', '1'], 'open app')
}
