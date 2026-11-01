// The AI pilot's guard (rule 12): every phone action Claude asks for gets a verdict here — allow, ask the user, or
// block. Pure, so the AI can't talk its way past it and every rule has a test.
import { nodeAt, screenPackage, type PhoneKey, type Popup, type UiNode } from './ui'

export interface PilotTask {
  goal: string; steps: string[]; apps: string[] /* packages */; to: string | null
  toApp?: string | null // `to` names a plan app (ChatGPT, Claude): the app itself is who you talk to, so sends go only there
}
export type PilotAction =
  | { kind: 'read' } | { kind: 'shot' } | { kind: 'wait' } | { kind: 'open'; pkg: string } | { kind: 'tap'; x: number; y: number }
  | { kind: 'press'; x: number; y: number } // long press: judged like a tap
  | { kind: 'type'; text: string } | { kind: 'swipe'; x1: number; y1: number; x2: number; y2: number } | { kind: 'key'; key: PhoneKey }
export interface SendInfo { to: string | null; message: string }
export type Verdict =
  | { v: 'allow'; send?: SendInfo } // send: a send that skipped the popup (switch OFF), for the log
  | { v: 'ask'; why: string; send: SendInfo | null }
  | { v: 'block'; why: string; stop: boolean }

export const STEP_LIMIT = 200
export const IDLE_MS = 600_000
export const SYSTEM_PANELS = 'com.android.systemui' // notification shade, quick settings, keyguard
export const APP_LOCKER = 'com.nothing.applocker'

// Banks, UPI, wallets, the Play Store (it charges), password managers, authenticators (rule 14): never opened, read or
// captured. Plus any package with a bank / pay / upi / wallet part — a false hit only blocks an app, never the reverse.
const MONEY = new Set([
  'com.phonepe.app', 'net.one97.paytm', 'com.google.android.apps.nbu.paisa.user', 'in.org.npci.upiapp', 'com.sbi.lotusintouch',
  'com.csam.icici.bank.imobile', 'com.snapwork.hdfc', 'com.axis.mobile', 'com.msf.kbank.mobile', 'com.google.android.apps.walletnfcrel',
  'com.android.vending', 'com.x8bit.bitwarden', 'com.agilebits.onepassword', 'com.lastpass.lpandroid', 'com.authy.authy',
  'com.azure.authenticator', 'com.google.android.apps.authenticator2',
])
export function isMoneyApp(pkg: string): boolean {
  return MONEY.has(pkg) || pkg.split('.').some((part) => /bank|pay|upi|wallet/i.test(part))
}

const SYSTEM_DIALOGS = new Set(['com.google.android.permissioncontroller', 'com.android.permissioncontroller', 'android'])
const SETTINGS = 'com.android.settings'
const MONEY_WORDS = new Set(['pay', 'payment', 'payments', 'rupee', 'upi', 'wallet', 'transfer', 'buy', 'purchase', 'order', 'checkout',
  'subscribe'])
const SEND_WORDS = new Set(['send', 'post', 'share', 'publish', 'reply'])
const REACT_WORDS = new Set(['react', 'reaction', 'reactions'])
const OTHER_WORDS = new Set(['delete', 'remove', 'uninstall', 'install', 'allow', 'confirm', 'accept'])
const LABEL_MAX = 40 // longer text is content (a chat bubble), not a button label

const words = (s: string) => s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
const idWords = (id: string) => (id.split(':id/').pop() ?? '').split(/[_\W]+|(?<=[a-z])(?=[A-Z])/).map((w) => w.toLowerCase())
const labels = (n: UiNode) => [n.text, n.desc].filter((s) => s && s.length <= LABEL_MAX)
const isEmoji = (s: string) => /^[\p{Extended_Pictographic}\p{Emoji_Component}\s]+$/u.test(s) && /\p{Extended_Pictographic}/u.test(s)

interface Risk { kind: 'money' | 'send' | 'react' | 'other'; word: string }
function risk(n: UiNode): Risk | null {
  const all = [...labels(n).flatMap(words), ...idWords(n.id)]
  const emoji = labels(n).find(isEmoji)
  for (const [kind, set] of [['money', MONEY_WORDS], ['send', SEND_WORDS], ['react', REACT_WORDS], ['other', OTHER_WORDS]] as const) {
    const word = all.find((w) => set.has(w))
    if (word) return { kind, word }
    if (kind === 'send' && emoji) return { kind: 'react', word: emoji } // a reaction row / emoji picker
  }
  return null
}

// Compose apps (ChatGPT) put a button's label on a separate element over it: an unlabelled, button-sized target takes
// the labels whose centre sits inside it. Not for big rows, whose message preview isn't a label.
const BUTTON_MAX = 300 // px, either side
function riskAt(target: UiNode, nodes: UiNode[]): Risk | null {
  const [l, t, r, b] = target.bounds
  if (risk(target) || labels(target).length || r - l > BUTTON_MAX || b - t > BUTTON_MAX) return risk(target)
  const inside = nodes.filter((n) => n !== target && (n.bounds[0] + n.bounds[2]) / 2 >= l && (n.bounds[0] + n.bounds[2]) / 2 < r
    && (n.bounds[1] + n.bounds[3]) / 2 >= t && (n.bounds[1] + n.bounds[3]) / 2 < b)
  const found = inside.map(risk).filter((x): x is Risk => !!x)
  return (['money', 'send', 'react', 'other'] as const).map((k) => found.find((x) => x.kind === k)).find((x) => x) ?? null
}

export function riskOf(n: UiNode): Risk['kind'] | null {
  return risk(n)?.kind ?? null
}

// Phone keyguard, Nothing App Lock, or an app's own lock / login screen. Phrases only: "Locked chats" or a message
// saying "unlock" is not a lock screen.
const LOCK_TEXT = /\b(?:enter|confirm) (?:your )?(?:pin|password|passcode)\b|\bdraw (?:your )?(?:unlock )?pattern\b|\b(?:use|touch) (?:your |the )?fingerprint\b|\bunlock with\b/i
export function isLockScreen(fg: string | null, nodes: UiNode[] | null, keyguard: boolean): boolean {
  return keyguard || fg === APP_LOCKER || !!nodes?.some((n) => n.password || labels(n).some((s) => LOCK_TEXT.test(s)))
}

// The chat's name: WhatsApp's title id, else the first plain text in the top 20 % of the screen (below the status bar).
const TITLE_IDS = ['com.whatsapp:id/conversation_contact_name', 'com.whatsapp.w4b:id/conversation_contact_name']
const titleById = (nodes: UiNode[]) => nodes.find((n) => TITLE_IDS.includes(n.id) && n.text)?.text ?? null
export function chatTitle(nodes: UiNode[]): string | null {
  return titleById(nodes) ?? topText(nodes)
}
function topText(nodes: UiNode[]): string | null {
  const height = Math.max(0, ...nodes.map((n) => n.bounds[3]))
  const top = nodes.find((n) => n.text && !n.editable && n.bounds[1] >= height * 0.03 && n.bounds[1] < height * 0.2)
  return top?.text ?? null
}

export function messageDraft(nodes: UiNode[]): string {
  return (nodes.find((n) => n.editable && n.focused) ?? nodes.find((n) => n.editable))?.text ?? ''
}

export function namesMatch(planned: string, onScreen: string): boolean {
  const p = words(planned)
  const s = words(onScreen)
  return p.length > 0 && s.some((_, i) => p.every((w, j) => s[i + j] === w))
}

const block = (why: string, stop = false): Verdict => ({ v: 'block', why, stop })
const isSearch = (n: UiNode) => idWords(n.id).includes('search')
const wrongChat = (planned: string, onScreen: string | null): Verdict | null =>
  !onScreen ? block("CAN'T READ WHO THIS GOES TO: TASK STOPPED", true)
  : !namesMatch(planned, onScreen) ? block(`WRONG CHAT: "${onScreen}" IS NOT "${planned}". TASK STOPPED`, true) : null
// The element under the finger. A swipe that starts on a button can click it (finger barely moves): judged like a tap there.
const targetOf = (a: PilotAction, nodes: UiNode[]) =>
  a.kind === 'tap' || a.kind === 'press' ? nodeAt(nodes, a.x, a.y) : a.kind === 'swipe' ? nodeAt(nodes, a.x1, a.y1) : null
const popupAt = (a: PilotAction, popups: Popup[]) => {
  const p = a.kind === 'tap' || a.kind === 'press' ? [a.x, a.y] : a.kind === 'swipe' ? [a.x1, a.y1] : null
  return p && popups.find(({ bounds: [l, t, r, b] }) => p[0] >= l && p[0] < r && p[1] >= t && p[1] < b)
}

// What the user agreed to: same app, same chat, same thing under the finger. Compared again after a question, because the
// screen can change while the user decides.
export function screenMark(a: PilotAction, nodes: UiNode[] | null, popups: Popup[] = []): string {
  if (!nodes) return ''
  const at = targetOf(a, nodes)
  return JSON.stringify([screenPackage(nodes), chatTitle(nodes), at && [at.text, at.desc, at.id, at.bounds], popupAt(a, popups) ?? null])
}

export class PilotGate {
  task: PilotTask | null = null
  askSends = true // the AI PILOT page switch; OFF skips the popup only for sends to the plan's `to`
  // The last chat name read from a real title field, per app: a full-screen picker (emoji search) can cover it.
  private seen: { pkg: string | null; title: string } | null = null
  private inside = new Map<string, string>() // app → the plan app it opened from (Gemini runs inside the Google app)
  private steps = 0
  private last = 0

  begin(task: PilotTask, now: number): void {
    this.task = task
    this.seen = null
    this.inside.clear()
    this.steps = 0
    this.last = now
  }

  end(): void {
    this.task = null
  }

  // Opening plan app `from` landed in another app (a launcher stub handing over): that app counts as `from` for this
  // task. Never a money app, Settings, system panels or dialogs; main also refuses the home screen and the app that was
  // already open before.
  adopt(from: string, to: string): boolean {
    const t = this.task
    if (!t?.apps.includes(from) || isMoneyApp(to) || to === SETTINGS || to === SYSTEM_PANELS || SYSTEM_DIALOGS.has(to)) return false
    if (!t.apps.includes(to)) t.apps = [...t.apps, to]
    this.inside.set(to, from)
    return true
  }

  // popups: windows `uiautomator dump` misses (ui.ts parsePopups).
  check(a: PilotAction, fg: string | null, nodes: UiNode[] | null, now: number, popups: Popup[] = []): Verdict {
    if (!this.task) return block('NO APPROVED TASK. CALL start_task FIRST.')
    if (now - this.last > IDLE_MS) return block('TASK TIMED OUT (10 MIN IDLE)', true)
    // A chat task (plan with a `to`) has no step limit (user, 2026-11-01): every send still asks, STOP and idle still end it.
    if (!this.task.to && this.steps >= STEP_LIMIT) return block(`STEP LIMIT (${STEP_LIMIT}) REACHED`, true)
    const title = nodes && titleById(nodes)
    if (title) this.seen = { pkg: screenPackage(nodes), title }
    const v = this.judge(this.task, a, fg, nodes, popups)
    if (v.v !== 'block') {
      this.steps++
      this.last = now
    }
    return v
  }

  // The real title field, else the one remembered for this app (a picker covers it), else the top-text guess.
  private chat(nodes: UiNode[]): string | null {
    return titleById(nodes) ?? (this.seen?.pkg === screenPackage(nodes) ? this.seen.title : null) ?? topText(nodes)
  }

  // Who a send goes to, and the block when it isn't the planned one. With `toApp` the app is the recipient.
  private recipient(task: PilotTask, fg: string, nodes: UiNode[] | null): { to: string | null; wrong: Verdict | null } {
    if (task.toApp && task.to) {
      const there = fg === task.toApp || this.inside.get(fg) === task.toApp
      return { to: task.to, wrong: there ? null : block(`SENDS GO ONLY TO ${task.to.toUpperCase()}. TASK STOPPED`, true) }
    }
    const to = nodes && this.chat(nodes)
    return { to, wrong: task.to ? wrongChat(task.to, to) : null }
  }

  private judge(task: PilotTask, a: PilotAction, fg: string | null, nodes: UiNode[] | null, popups: Popup[]): Verdict {
    if (a.kind === 'key' && a.key !== 'enter') return { v: 'allow' } // back / home only ever leave
    if (a.kind === 'open') {
      if (isMoneyApp(a.pkg)) return block('MONEY APPS ARE BLOCKED', true)
      return task.apps.includes(a.pkg) ? { v: 'allow' } : block(`${a.pkg} IS NOT IN THE PLAN`)
    }
    if (a.kind === 'type' && nodes?.some((n) => n.password && n.focused)) return block('NEVER TYPES INTO A PASSWORD FIELD')
    if (!fg) return block("CAN'T TELL WHICH APP IS OPEN")
    if (isMoneyApp(fg)) return block('A MONEY APP IS OPEN: TASK STOPPED', true)
    const looks = a.kind === 'read' || a.kind === 'shot' || a.kind === 'wait'
    if (SYSTEM_DIALOGS.has(fg)) return looks ? { v: 'allow' } : { v: 'ask', why: 'SYSTEM DIALOG', send: null }
    const target = nodes && targetOf(a, nodes)
    // With System panels in the plan, the shade can be pulled down from any screen (not from a button on it).
    const shadePull = a.kind === 'swipe' && task.apps.includes(SYSTEM_PANELS) && !target?.clickable
    if (!task.apps.includes(fg) && !shadePull) return block(`${fg} IS NOT IN THE PLAN`)
    if (looks) return { v: 'allow' }
    const panel = fg === SYSTEM_PANELS
    if (fg === SETTINGS && a.kind !== 'swipe') return { v: 'ask', why: 'SETTINGS', send: null }
    if (a.kind === 'type') return panel ? { v: 'ask', why: 'SYSTEM PANEL', send: null } : { v: 'allow' }
    // A popup TETHER can't read (a reaction row, a menu): always asks, even with the send switch OFF; wrong chat still stops.
    const popup = popupAt(a, popups)
    if (popup) {
      if (isMoneyApp(popup.pkg)) return block('A MONEY APP IS OPEN: TASK STOPPED', true)
      return this.recipient(task, fg, nodes).wrong || { v: 'ask', why: 'POPUP', send: null }
    }
    // No UI tree (a game, or uiautomator busy): a tap or Enter can't be classified, so it asks; scrolling can't send.
    const what = a.kind === 'tap' ? 'TAP' : a.kind === 'press' ? 'LONG PRESS' : 'PRESS ENTER'
    if (!nodes) return a.kind === 'swipe' ? { v: 'allow' } : { v: 'ask', why: `${what} WITHOUT SCREEN TEXT`, send: null }
    const r: Risk | null = a.kind === 'key' ? (nodes.some((n) => n.editable && n.focused && !isSearch(n)) ? { kind: 'send', word: 'send' } : null)
      : target && riskAt(target, nodes)
    if (r?.kind === 'money') return block(`PAYMENT BUTTON ("${r.word.toUpperCase()}"): TASK STOPPED`, true)
    if (panel && (a.kind !== 'swipe' || target?.clickable)) return { v: 'ask', why: 'SYSTEM PANEL', send: null }
    if (!r) return { v: 'allow' }
    if (r.kind === 'other') return { v: 'ask', why: r.word.toUpperCase(), send: null }
    const { to, wrong } = this.recipient(task, fg, nodes)
    if (wrong) return wrong
    const send = { to, message: r.kind === 'react' ? r.word : messageDraft(nodes) }
    if (!this.askSends && task.to) return { v: 'allow', send }
    return { v: 'ask', why: r.kind === 'react' ? 'REACT' : 'SEND', send }
  }
}
