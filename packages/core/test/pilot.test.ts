import { describe, expect, it } from 'vitest'
import {
  chatTitle, IDLE_MS, isMoneyApp, messageDraft, namesMatch, PilotGate, riskOf, STEP_LIMIT, type PilotAction, type PilotTask,
} from '../src/pilot'
import type { UiNode } from '../src/ui'

const node = (n: Partial<UiNode>): UiNode => ({
  text: '', desc: '', id: '', cls: 'android.widget.TextView', pkg: 'com.whatsapp', bounds: [0, 0, 100, 100],
  clickable: false, editable: false, focused: false, password: false, ...n,
})
const WA = 'com.whatsapp'
const root = node({ cls: 'android.widget.FrameLayout', bounds: [0, 0, 1080, 2400] })
const title = (text: string) => node({ text, id: 'com.whatsapp:id/conversation_contact_name', bounds: [200, 100, 700, 180] })
const input = node({ text: 'on my way', cls: 'android.widget.EditText', editable: true, focused: true, clickable: true, bounds: [40, 2200, 900, 2320] })
const sendBtn = node({ desc: 'Send', id: 'com.whatsapp:id/send', cls: 'android.widget.ImageButton', clickable: true, bounds: [920, 2200, 1060, 2320] })
const chat = (name: string) => [root, title(name), input, sendBtn]
const TAP_SEND: PilotAction = { kind: 'tap', x: 990, y: 2260 }
const task = (t: Partial<PilotTask> = {}): PilotTask => ({ goal: 'reply', steps: ['open chat'], apps: [WA], to: null, ...t })
const started = (t: Partial<PilotTask> = {}) => {
  const g = new PilotGate()
  g.begin(task(t), 0)
  return g
}

describe('isMoneyApp', () => {
  it('money apps', () => {
    for (const pkg of ['com.phonepe.app', 'net.one97.paytm', 'com.google.android.apps.nbu.paisa.user', 'in.org.npci.upiapp',
      'com.sbi.lotusintouch', 'com.google.android.apps.walletnfcrel', 'com.x8bit.bitwarden', 'com.google.android.apps.authenticator2',
      'com.android.vending', 'com.anything.mybank']) expect(isMoneyApp(pkg), pkg).toBe(true)
    for (const pkg of ['com.whatsapp', 'com.instagram.android', 'com.google.android.youtube']) expect(isMoneyApp(pkg), pkg).toBe(false)
  })
})

describe('riskOf', () => {
  it('send by description or id', () => {
    expect(riskOf(node({ text: 'Send' }))).toBe('send')
    expect(riskOf(node({ desc: 'Send' }))).toBe('send')
    expect(riskOf(node({ id: 'com.whatsapp:id/send' }))).toBe('send')
    expect(riskOf(node({ id: 'com.x:id/btn_send' }))).toBe('send')
    for (const text of ['Delete', 'Install', 'Allow', 'Pay', 'Confirm']) expect(riskOf(node({ text })), text).toBe('other')
    expect(riskOf(node({ text: 'Sender info' }))).toBeNull()
    expect(riskOf(node({ text: 'Settings' }))).toBeNull()
  })
  it('a long chat bubble is not a button', () => {
    expect(riskOf(node({ text: 'can you please send me the photos from yesterday?' }))).toBeNull()
  })
})

describe('chatTitle + messageDraft', () => {
  it('reads the WhatsApp chat name and the draft', () => {
    expect(chatTitle(chat('Mom ❤️'))).toBe('Mom ❤️')
    expect(messageDraft(chat('Mom'))).toBe('on my way')
  })
  it('falls back to the top text', () => {
    const top = node({ text: 'Ann Lee', pkg: 'com.other', bounds: [150, 120, 600, 200] })
    const status = node({ text: '12:30', pkg: 'com.other', bounds: [0, 0, 100, 40] }) // status bar strip (top 3 %)
    const body = node({ text: 'hello', pkg: 'com.other', bounds: [100, 1200, 600, 1300] })
    expect(chatTitle([root, status, top, body])).toBe('Ann Lee')
    expect(chatTitle([root, body])).toBeNull()
  })
  it('draft falls back to the first input', () => {
    expect(messageDraft([root, { ...input, focused: false }])).toBe('on my way')
    expect(messageDraft([root])).toBe('')
  })
})

describe('namesMatch', () => {
  it('names match whole words', () => {
    expect(namesMatch('mom', 'Mom ❤️')).toBe(true)
    expect(namesMatch('Mom', 'mom.')).toBe(true)
    expect(namesMatch('mom', 'Mommy')).toBe(false)
    expect(namesMatch('Mom', 'Monica Work')).toBe(false)
    expect(namesMatch('Ann Lee', 'ann  lee')).toBe(true)
    expect(namesMatch('', 'Mom')).toBe(false)
  })
})

describe('PilotGate', () => {
  const ALL: PilotAction[] = [{ kind: 'read' }, { kind: 'shot' }, { kind: 'open', pkg: WA }, TAP_SEND, { kind: 'type', text: 'x' },
    { kind: 'swipe', x1: 1, y1: 1, x2: 2, y2: 2 }, { kind: 'key', key: 'back' }]

  it('no task blocks everything', () => {
    const g = new PilotGate()
    for (const a of ALL) expect(g.check(a, WA, chat('Mom'), 0), a.kind).toEqual({ v: 'block', why: expect.any(String), stop: false })
  })

  it('open only plan apps', () => {
    expect(started().check({ kind: 'open', pkg: WA }, null, null, 1).v).toBe('allow')
    expect(started().check({ kind: 'open', pkg: 'com.instagram.android' }, WA, null, 1)).toMatchObject({ v: 'block', stop: false })
    expect(started({ apps: [WA, 'com.phonepe.app'] }).check({ kind: 'open', pkg: 'com.phonepe.app' }, WA, null, 1))
      .toMatchObject({ v: 'block', stop: true })
  })

  it('money app in front stops the task', () => {
    for (const a of [{ kind: 'read' }, { kind: 'shot' }, TAP_SEND] as PilotAction[]) {
      expect(started().check(a, 'com.phonepe.app', [], 1), a.kind).toMatchObject({ v: 'block', stop: true })
    }
  })

  it('app outside the plan is blocked', () => {
    const ig = [node({ pkg: 'com.instagram.android', bounds: [0, 0, 1080, 2400] })]
    expect(started().check({ kind: 'tap', x: 5, y: 5 }, 'com.instagram.android', ig, 1)).toMatchObject({ v: 'block', stop: false })
    expect(started().check({ kind: 'read' }, 'com.instagram.android', ig, 1)).toMatchObject({ v: 'block', stop: false })
    expect(started().check({ kind: 'key', key: 'back' }, 'com.instagram.android', ig, 1).v).toBe('allow')
    expect(started().check({ kind: 'key', key: 'home' }, 'com.instagram.android', ig, 1).v).toBe('allow')
  })

  it('send asks with recipient + message', () => {
    expect(started({ to: 'Mom' }).check(TAP_SEND, WA, chat('Mom ❤️'), 1))
      .toEqual({ v: 'ask', why: 'SEND', send: { to: 'Mom ❤️', message: 'on my way' } })
  })

  it('send without a planned recipient still asks', () => {
    expect(started().check(TAP_SEND, WA, chat('Ann'), 1)).toEqual({ v: 'ask', why: 'SEND', send: { to: 'Ann', message: 'on my way' } })
  })

  it('wrong chat blocks', () => {
    const v = started({ to: 'Mom' }).check(TAP_SEND, WA, chat('Monica Work'), 1)
    expect(v).toMatchObject({ v: 'block', stop: true })
    expect(v.v === 'block' && v.why).toContain('Monica Work')
  })

  it('unreadable recipient blocks', () => {
    expect(started({ to: 'Mom' }).check(TAP_SEND, WA, [root, input, sendBtn], 1)).toMatchObject({ v: 'block', stop: true })
  })

  it('other risky taps ask without send info', () => {
    const del = node({ text: 'Delete', clickable: true, bounds: [0, 1000, 500, 1100] })
    expect(started().check({ kind: 'tap', x: 10, y: 1050 }, WA, [root, del], 1)).toEqual({ v: 'ask', why: 'DELETE', send: null })
  })

  it('plain taps, typing and swipes are allowed', () => {
    const g = started()
    expect(g.check({ kind: 'tap', x: 300, y: 140 }, WA, chat('Mom'), 1).v).toBe('allow')
    expect(g.check({ kind: 'type', text: 'hi' }, WA, chat('Mom'), 2).v).toBe('allow')
    expect(g.check({ kind: 'swipe', x1: 1, y1: 2, x2: 3, y2: 4 }, WA, chat('Mom'), 3).v).toBe('allow')
    expect(g.check({ kind: 'read' }, WA, chat('Mom'), 4).v).toBe('allow')
  })

  it('enter in a text field is a send', () => {
    expect(started({ to: 'Mom' }).check({ kind: 'key', key: 'enter' }, WA, chat('Mom'), 1)).toMatchObject({ v: 'ask', why: 'SEND' })
    expect(started({ to: 'Mom' }).check({ kind: 'key', key: 'enter' }, WA, chat('Monica'), 1)).toMatchObject({ v: 'block', stop: true })
    expect(started().check({ kind: 'key', key: 'enter' }, WA, [root, sendBtn], 1).v).toBe('allow')
  })

  it('settings and system dialogs ask', () => {
    const s = 'com.android.settings'
    const sNodes = [node({ pkg: s, bounds: [0, 0, 1080, 2400] })]
    expect(started({ apps: [s] }).check({ kind: 'tap', x: 5, y: 5 }, s, sNodes, 1)).toMatchObject({ v: 'ask', why: 'SETTINGS' })
    const p = 'com.google.android.permissioncontroller'
    const pNodes = [node({ pkg: p, bounds: [0, 0, 1080, 2400] })]
    expect(started().check({ kind: 'tap', x: 5, y: 5 }, p, pNodes, 1)).toMatchObject({ v: 'ask', why: 'SYSTEM DIALOG' })
    expect(started().check({ kind: 'read' }, p, pNodes, 1).v).toBe('allow')
  })

  it('game screen taps are allowed', () => {
    expect(started().check({ kind: 'tap', x: 500, y: 500 }, WA, null, 1).v).toBe('allow')
  })

  it('unknown foreground blocks', () => {
    expect(started().check({ kind: 'tap', x: 5, y: 5 }, null, null, 1)).toMatchObject({ v: 'block', stop: false })
  })

  it('limits', () => {
    const g = started()
    for (let i = 0; i < STEP_LIMIT; i++) expect(g.check({ kind: 'read' }, WA, chat('Mom'), i).v).toBe('allow')
    expect(g.check({ kind: 'read' }, WA, chat('Mom'), STEP_LIMIT)).toMatchObject({ v: 'block', stop: true })

    const idle = started()
    expect(idle.check({ kind: 'read' }, WA, chat('Mom'), 1000).v).toBe('allow')
    expect(idle.check({ kind: 'read' }, WA, chat('Mom'), 1000 + IDLE_MS + 1)).toMatchObject({ v: 'block', stop: true })

    const ended = started()
    ended.end()
    expect(ended.check({ kind: 'read' }, WA, chat('Mom'), 1)).toMatchObject({ v: 'block', stop: false })
  })
})
