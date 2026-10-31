// tether-mcp ⇄ TETHER: one JSON object per line over a local named pipe, each request carrying the token TETHER writes
// to %LOCALAPPDATA%\Tether\pilot.token. Shared by both sides; every request is checked here before main acts on it.

export const PILOT_PIPE = '\\\\.\\pipe\\tether-pilot'
export const TOOLS = ['start_task', 'list_apps', 'open_app', 'read_screen', 'screenshot', 'tap', 'long_press', 'type', 'swipe', 'key', 'wait_for_change',
  'ask_user', 'end_task'] as const
export type ToolName = (typeof TOOLS)[number]
export interface PilotRequest { token: string; id: number; tool: ToolName; args: Record<string, unknown> }
export type PilotReply =
  | { id: number; ok: true; text: string; image?: { data: string; mime: 'image/jpeg' } }
  | { id: number; ok: false; error: string }

const LINE_MAX = 64 * 1024

export function parseRequest(line: string): PilotRequest | null {
  if (line.length > LINE_MAX) return null
  let o: unknown
  try {
    o = JSON.parse(line)
  } catch {
    return null
  }
  const r = o as PilotRequest
  const ok = typeof o === 'object' && o !== null && typeof r.token === 'string' && r.token.length > 0 && Number.isInteger(r.id) &&
    (TOOLS as readonly string[]).includes(r.tool) && typeof r.args === 'object' && r.args !== null && !Array.isArray(r.args)
  return ok ? { token: r.token, id: r.id, tool: r.tool, args: r.args } : null
}

const str = (v: unknown, min: number, max: number) => typeof v === 'string' && v.length >= min && v.length <= max
const strs = (v: unknown, min: number, max: number, each: number) =>
  Array.isArray(v) && v.length >= min && v.length <= max && v.every((s) => str(s, 1, each))
const coord = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 10_000

export function badArgs(tool: ToolName, a: Record<string, unknown>): string | null {
  switch (tool) {
    case 'start_task':
      if (!str(a.goal, 1, 300)) return 'goal: 1–300 characters'
      if (!strs(a.steps, 1, 20, 200)) return 'steps: 1–20 strings of up to 200 characters'
      if (!strs(a.apps, 1, 5, 100)) return 'apps: 1–5 app names'
      if (a.to !== undefined && a.to !== null && !str(a.to, 1, 100)) return 'to: up to 100 characters'
      return null
    case 'open_app': return str(a.app, 1, 100) ? null : 'app: 1–100 characters'
    case 'tap': case 'long_press': return coord(a.x) && coord(a.y) ? null : 'x, y: whole phone pixels 0–10000'
    case 'swipe': return [a.x1, a.y1, a.x2, a.y2].every(coord) ? null : 'x1, y1, x2, y2: whole phone pixels 0–10000'
    case 'type': return str(a.text, 1, 1000) ? null : 'text: 1–1000 characters'
    case 'key': return a.key === 'back' || a.key === 'home' || a.key === 'enter' ? null : 'key: back, home or enter'
    case 'ask_user': return str(a.question, 1, 300) ? null : 'question: 1–300 characters'
    case 'wait_for_change':
      return a.timeout_s === undefined || (Number.isInteger(a.timeout_s) && (a.timeout_s as number) >= 5 && (a.timeout_s as number) <= 300)
        ? null : 'timeout_s: whole seconds 5–300'
    case 'end_task': return a.summary === undefined || str(a.summary, 0, 2000) ? null : 'summary: up to 2000 characters'
    default: return null
  }
}

export class Lines {
  private tail = ''

  push(chunk: string): string[] {
    const parts = (this.tail + chunk).split(/\r?\n/)
    this.tail = parts.pop() ?? ''
    return parts.filter((p) => p.length > 0)
  }
}
