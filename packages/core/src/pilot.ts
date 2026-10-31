// The AI pilot's guard (rule 12): every phone action Claude asks for gets a verdict here — allow, ask the user, or
// block. Pure, so the AI can't talk its way past it and every rule has a test.
import { nodeAt, type PhoneKey, type UiNode } from './ui'

export interface PilotTask { goal: string; steps: string[]; apps: string[] /* packages */; to: string | null }
export type PilotAction =
  | { kind: 'read' } | { kind: 'shot' } | { kind: 'open'; pkg: string } | { kind: 'tap'; x: number; y: number }
  | { kind: 'type'; text: string } | { kind: 'swipe'; x1: number; y1: number; x2: number; y2: number } | { kind: 'key'; key: PhoneKey }
export interface SendInfo { to: string | null; message: string }
export type Verdict =
  | { v: 'allow' }
  | { v: 'ask'; why: string; send: SendInfo | null }
  | { v: 'block'; why: string; stop: boolean }

export const STEP_LIMIT = 40
export const IDLE_MS = 600_000

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
const SEND_WORDS = new Set(['send', 'post', 'share', 'publish', 'reply'])
const OTHER_WORDS = new Set(['pay', 'buy', 'purchase', 'order', 'checkout', 'delete', 'remove', 'uninstall', 'install', 'allow',
  'confirm', 'accept', 'transfer', 'subscribe'])
const LABEL_MAX = 40 // longer text is content (a chat bubble), not a button label

const words = (s: string) => s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
const idWords = (id: string) => (id.split(':id/').pop() ?? '').split(/[_\W]+|(?<=[a-z])(?=[A-Z])/).map((w) => w.toLowerCase())

function riskWord(n: UiNode): string | null {
  const all = [...(n.text.length <= LABEL_MAX ? words(n.text) : []), ...(n.desc.length <= LABEL_MAX ? words(n.desc) : []), ...idWords(n.id)]
  return all.find((w) => SEND_WORDS.has(w)) ?? all.find((w) => OTHER_WORDS.has(w)) ?? null
}

export function riskOf(n: UiNode): 'send' | 'other' | null {
  const w = riskWord(n)
  return w === null ? null : SEND_WORDS.has(w) ? 'send' : 'other'
}

// The chat's name: WhatsApp's title id, else the first plain text in the top 20 % of the screen (below the status bar).
const TITLE_IDS = ['com.whatsapp:id/conversation_contact_name', 'com.whatsapp.w4b:id/conversation_contact_name']
export function chatTitle(nodes: UiNode[]): string | null {
  const byId = nodes.find((n) => TITLE_IDS.includes(n.id) && n.text)
  if (byId) return byId.text
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

export class PilotGate {
  task: PilotTask | null = null
  private steps = 0
  private last = 0

  begin(task: PilotTask, now: number): void {
    this.task = task
    this.steps = 0
    this.last = now
  }

  end(): void {
    this.task = null
  }

  check(a: PilotAction, fg: string | null, nodes: UiNode[] | null, now: number): Verdict {
    if (!this.task) return block('NO APPROVED TASK. CALL start_task FIRST.')
    if (now - this.last > IDLE_MS) return block('TASK TIMED OUT (10 MIN IDLE)', true)
    if (this.steps >= STEP_LIMIT) return block(`STEP LIMIT (${STEP_LIMIT}) REACHED`, true)
    const v = this.judge(this.task, a, fg, nodes)
    if (v.v !== 'block') {
      this.steps++
      this.last = now
    }
    return v
  }

  private judge(task: PilotTask, a: PilotAction, fg: string | null, nodes: UiNode[] | null): Verdict {
    if (a.kind === 'key' && a.key !== 'enter') return { v: 'allow' } // back / home only ever leave
    if (a.kind === 'open') {
      if (isMoneyApp(a.pkg)) return block('MONEY APPS ARE BLOCKED', true)
      return task.apps.includes(a.pkg) ? { v: 'allow' } : block(`${a.pkg} IS NOT IN THE PLAN`)
    }
    if (!fg) return block("CAN'T TELL WHICH APP IS OPEN")
    if (isMoneyApp(fg)) return block('A MONEY APP IS OPEN: TASK STOPPED', true)
    if (SYSTEM_DIALOGS.has(fg)) return a.kind === 'read' || a.kind === 'shot' ? { v: 'allow' } : { v: 'ask', why: 'SYSTEM DIALOG', send: null }
    if (!task.apps.includes(fg)) return block(`${fg} IS NOT IN THE PLAN`)
    if (a.kind === 'read' || a.kind === 'shot' || a.kind === 'swipe') return { v: 'allow' }
    if (fg === SETTINGS) return { v: 'ask', why: 'SETTINGS', send: null }
    if (a.kind === 'type' || !nodes) return { v: 'allow' } // no UI tree (game): taps can't be classified
    const target = a.kind === 'tap' ? nodeAt(nodes, a.x, a.y) : null
    const word = a.kind === 'key' ? (nodes.some((n) => n.editable && n.focused) ? 'send' : null) : target && riskWord(target)
    if (!word) return { v: 'allow' }
    if (!SEND_WORDS.has(word)) return { v: 'ask', why: word.toUpperCase(), send: null }
    const to = chatTitle(nodes)
    if (task.to && !to) return block("CAN'T READ WHO THIS GOES TO: TASK STOPPED", true)
    if (task.to && to && !namesMatch(task.to, to)) return block(`WRONG CHAT: "${to}" IS NOT "${task.to}". TASK STOPPED`, true)
    return { v: 'ask', why: 'SEND', send: { to, message: messageDraft(nodes) } }
  }
}
