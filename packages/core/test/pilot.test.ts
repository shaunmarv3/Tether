import { describe, expect, it } from 'vitest'
import {
  APP_LOCKER, chatTitle, IDLE_MS, isLockScreen, isMoneyApp, messageDraft, namesMatch, PilotGate, riskOf, screenMark, STEP_LIMIT, SYSTEM_PANELS,
  type PilotAction, type PilotTask,
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
    for (const text of ['Delete', 'Install', 'Allow', 'Confirm']) expect(riskOf(node({ text })), text).toBe('other')
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

describe('screenMark', () => {
  it('changes when the chat or the target changes', () => {
    const same = screenMark(TAP_SEND, chat('Mom'))
    expect(screenMark(TAP_SEND, chat('Mom'))).toBe(same)
    expect(screenMark(TAP_SEND, chat('Monica'))).not.toBe(same)
    expect(screenMark(TAP_SEND, [root, title('Mom'), input])).not.toBe(same) // send button gone
    expect(screenMark(TAP_SEND, null)).not.toBe(same)
  })
})

describe('isLockScreen', () => {
  it('lock text is a phrase, not a word', () => {
    const t = (text: string) => [root, node({ text })]
    expect(isLockScreen('com.android.systemui', [root], true)).toBe(true)
    expect(isLockScreen(APP_LOCKER, null, false)).toBe(true)
    expect(isLockScreen(WA, [root, node({ password: true, editable: true })], false)).toBe(true)
    for (const text of ['Enter PIN', 'Draw your pattern', 'Use fingerprint', 'Enter your password']) expect(isLockScreen(WA, t(text), false), text).toBe(true)
    for (const text of ['unlock the door', 'Locked chats', 'fingerprint']) expect(isLockScreen(WA, t(text), false), text).toBe(false)
    expect(isLockScreen(WA, null, false)).toBe(false)
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

  it('a swipe that starts on Send is a send', () => {
    expect(started({ to: 'Mom' }).check({ kind: 'swipe', x1: 990, y1: 2260, x2: 990, y2: 2260 }, WA, chat('Mom'), 1))
      .toMatchObject({ v: 'ask', why: 'SEND' })
    expect(started({ to: 'Mom' }).check({ kind: 'swipe', x1: 990, y1: 2260, x2: 995, y2: 2262 }, WA, chat('Monica'), 1))
      .toMatchObject({ v: 'block', stop: true })
    expect(started().check({ kind: 'swipe', x1: 500, y1: 1800, x2: 500, y2: 600 }, WA, chat('Mom'), 1).v).toBe('allow') // a scroll
  })

  it('no screen text: taps and enter ask', () => {
    expect(started().check({ kind: 'tap', x: 500, y: 500 }, WA, null, 1)).toMatchObject({ v: 'ask', send: null })
    expect(started().check({ kind: 'key', key: 'enter' }, WA, null, 1)).toMatchObject({ v: 'ask', send: null })
    expect(started().check({ kind: 'swipe', x1: 1, y1: 2, x2: 3, y2: 4 }, WA, null, 1).v).toBe('allow')
    expect(started().check({ kind: 'read' }, WA, null, 1).v).toBe('allow')
  })

  it('money words win over send words', () => {
    for (const text of ['Pay & send', 'Payments on WhatsApp', 'UPI', 'Buy now', 'Order', 'Pay']) expect(riskOf(node({ text })), text).toBe('money')
    const pay = node({ text: 'Pay & send', clickable: true, bounds: [0, 1000, 500, 1100] })
    expect(started().check({ kind: 'tap', x: 10, y: 1050 }, WA, [root, pay], 1)).toMatchObject({ v: 'block', stop: true })
    expect(started().check({ kind: 'press', x: 10, y: 1050 }, WA, [root, pay], 1)).toMatchObject({ v: 'block', stop: true })
  })

  it('reactions', () => {
    expect(riskOf(node({ desc: '❤️' }))).toBe('react')
    expect(riskOf(node({ text: '😂' }))).toBe('react')
    expect(riskOf(node({ id: 'com.x:id/reaction_view' }))).toBe('react')
    expect(riskOf(node({ text: '1' }))).toBeNull()
    expect(riskOf(node({ text: 'Hi 👋' }))).toBeNull()
    const heart = node({ desc: '❤️', clickable: true, bounds: [300, 900, 400, 1000] })
    const tap = { kind: 'tap', x: 350, y: 950 } as const
    expect(started({ to: 'Mom' }).check(tap, WA, [...chat('Mom'), heart], 1))
      .toEqual({ v: 'ask', why: 'REACT', send: { to: 'Mom', message: '❤️' } })
    expect(started({ to: 'Mom' }).check(tap, WA, [...chat('Monica'), heart], 1)).toMatchObject({ v: 'block', stop: true })
  })

  it('long press is judged like a tap', () => {
    expect(started().check({ kind: 'press', x: 990, y: 2260 }, WA, chat('Mom'), 1)).toMatchObject({ v: 'ask', why: 'SEND' })
    expect(started().check({ kind: 'press', x: 300, y: 140 }, WA, chat('Mom'), 1).v).toBe('allow')
    expect(started().check({ kind: 'press', x: 5, y: 5 }, WA, null, 1)).toMatchObject({ v: 'ask', why: 'LONG PRESS WITHOUT SCREEN TEXT' })
  })

  it('switch off only skips planned sends', () => {
    const off = (t: Partial<PilotTask>) => {
      const g = started(t)
      g.askSends = false
      return g
    }
    expect(off({ to: 'Mom' }).check(TAP_SEND, WA, chat('Mom'), 1)).toEqual({ v: 'allow', send: { to: 'Mom', message: 'on my way' } })
    expect(off({ to: 'Mom' }).check(TAP_SEND, WA, chat('Monica'), 1)).toMatchObject({ v: 'block', stop: true })
    expect(off({}).check(TAP_SEND, WA, chat('Mom'), 1)).toMatchObject({ v: 'ask', why: 'SEND' })
    const del = node({ text: 'Delete', clickable: true, bounds: [0, 1000, 500, 1100] })
    expect(off({ to: 'Mom' }).check({ kind: 'tap', x: 10, y: 1050 }, WA, [root, del], 1)).toMatchObject({ v: 'ask', why: 'DELETE' })
  })

  it('a tap in a popup the dump misses always asks (WhatsApp reaction row)', () => {
    const row = [{ pkg: WA, bounds: [0, 1974, 1080, 2181] as [number, number, number, number] }]
    const heart = { kind: 'tap', x: 288, y: 2078 } as const
    expect(started({ to: 'Mom' }).check(heart, WA, chat('Mom'), 1, row)).toEqual({ v: 'ask', why: 'POPUP', send: null })
    expect(started({ to: 'Mom' }).check(heart, WA, chat('Monica'), 1, row)).toMatchObject({ v: 'block', stop: true })
    const off = started({ to: 'Mom' })
    off.askSends = false
    expect(off.check(heart, WA, chat('Mom'), 1, row)).toMatchObject({ v: 'ask', why: 'POPUP' }) // switch OFF doesn't cover it
    expect(started().check({ kind: 'press', x: 288, y: 2078 }, WA, null, 1, row)).toMatchObject({ v: 'ask', why: 'POPUP' })
    expect(started().check({ kind: 'tap', x: 288, y: 1500 }, WA, chat('Mom'), 1, row).v).toBe('allow') // outside it
    const pay = [{ pkg: 'com.phonepe.app', bounds: row[0].bounds }]
    expect(started().check(heart, WA, chat('Mom'), 1, pay)).toMatchObject({ v: 'block', stop: true })
    expect(screenMark(heart, chat('Mom'), row)).not.toBe(screenMark(heart, chat('Mom'), []))
  })

  it('a full-screen emoji search covering the chat uses the last chat seen in that app', () => {
    const sheet = [node({ cls: 'android.widget.FrameLayout', bounds: [0, 0, 1080, 2400] }),
      node({ cls: 'android.widget.EditText', text: 'wave', editable: true, focused: true, bounds: [100, 220, 1000, 310] }),
      node({ text: 'Frequently used', id: 'com.whatsapp:id/title', bounds: [40, 360, 300, 420] }), // the picker's heading
      node({ cls: 'android.widget.Button', desc: '👋', id: 'com.whatsapp:id/emoji', clickable: true, bounds: [0, 330, 120, 440] })]
    const wave = { kind: 'tap', x: 60, y: 385 } as const
    const g = started({ to: 'You' })
    expect(g.check({ kind: 'read' }, WA, chat('+1 555 0100 (You)'), 1).v).toBe('allow')
    expect(g.check(wave, WA, sheet, 2)).toEqual({ v: 'ask', why: 'REACT', send: { to: '+1 555 0100 (You)', message: '👋' } })
    const other = started({ to: 'You' })
    other.check({ kind: 'read' }, WA, chat('Monica'), 1)
    expect(other.check(wave, WA, sheet, 2)).toMatchObject({ v: 'block', stop: true })
    expect(started({ to: 'You' }).check(wave, WA, sheet, 2)).toMatchObject({ v: 'block', stop: true }) // never saw a chat
    const ig = started({ to: 'You', apps: [WA, 'com.instagram.android'] })
    ig.check({ kind: 'read' }, WA, chat('You'), 1)
    const igSheet = sheet.map((n) => ({ ...n, pkg: 'com.instagram.android' }))
    expect(ig.check(wave, 'com.instagram.android', igSheet, 2)).toMatchObject({ v: 'block', stop: true }) // other app
  })

  it('never types into a password field', () => {
    const pw = node({ cls: 'android.widget.EditText', editable: true, focused: true, password: true, bounds: [0, 500, 1080, 600] })
    expect(started().check({ kind: 'type', text: '1234' }, WA, [root, pw], 1)).toMatchObject({ v: 'block', stop: false })
    const p = 'com.google.android.permissioncontroller'
    expect(started().check({ kind: 'type', text: '1234' }, p, [root, pw], 1)).toMatchObject({ v: 'block', stop: false })
    expect(started().check({ kind: 'type', text: 'hi' }, WA, chat('Mom'), 1).v).toBe('allow')
  })

  it('system panels', () => {
    const ui = SYSTEM_PANELS
    const tile = node({ pkg: ui, desc: 'Wi-Fi', clickable: true, bounds: [0, 200, 500, 400] })
    const shade = [node({ pkg: ui, bounds: [0, 0, 1080, 2400] }), tile]
    const g = () => started({ apps: [WA, ui] })
    expect(g().check({ kind: 'read' }, ui, shade, 1).v).toBe('allow')
    expect(g().check({ kind: 'wait' }, ui, shade, 1).v).toBe('allow')
    expect(g().check({ kind: 'tap', x: 600, y: 1000 }, ui, shade, 1)).toMatchObject({ v: 'ask', why: 'SYSTEM PANEL' })
    expect(g().check({ kind: 'type', text: 'x' }, ui, shade, 1)).toMatchObject({ v: 'ask', why: 'SYSTEM PANEL' })
    expect(g().check({ kind: 'key', key: 'enter' }, ui, shade, 1)).toMatchObject({ v: 'ask', why: 'SYSTEM PANEL' })
    expect(g().check({ kind: 'swipe', x1: 600, y1: 1000, x2: 600, y2: 300 }, ui, shade, 1).v).toBe('allow')
    expect(g().check({ kind: 'swipe', x1: 100, y1: 300, x2: 100, y2: 310 }, ui, shade, 1)).toMatchObject({ v: 'ask', why: 'SYSTEM PANEL' })
    const home = 'com.nothing.launcher'
    const launcher = [node({ pkg: home, bounds: [0, 0, 1080, 2400] })]
    expect(g().check({ kind: 'swipe', x1: 540, y1: 5, x2: 540, y2: 1500 }, home, launcher, 1).v).toBe('allow')
    expect(g().check({ kind: 'tap', x: 540, y: 5 }, home, launcher, 1)).toMatchObject({ v: 'block', stop: false })
    expect(started().check({ kind: 'swipe', x1: 540, y1: 5, x2: 540, y2: 1500 }, home, launcher, 1)).toMatchObject({ v: 'block' })
    expect(started().check({ kind: 'read' }, ui, shade, 1)).toMatchObject({ v: 'block', stop: false })
  })

  it('wait is judged like read', () => {
    expect(started().check({ kind: 'wait' }, WA, chat('Mom'), 1).v).toBe('allow')
    expect(started().check({ kind: 'wait' }, 'com.phonepe.app', null, 1)).toMatchObject({ v: 'block', stop: true })
    expect(started().check({ kind: 'wait' }, 'com.instagram.android', null, 1)).toMatchObject({ v: 'block', stop: false })
  })

  it('unknown foreground blocks', () => {
    expect(started().check({ kind: 'tap', x: 5, y: 5 }, null, null, 1)).toMatchObject({ v: 'block', stop: false })
  })

  it('limits', () => {
    const g = started()
    for (let i = 0; i < STEP_LIMIT; i++) expect(g.check({ kind: 'read' }, WA, chat('Mom'), i).v).toBe('allow')
    expect(g.check({ kind: 'read' }, WA, chat('Mom'), STEP_LIMIT)).toMatchObject({ v: 'block', stop: true })

    const talk = started({ to: 'Mom' }) // a chat task: no step limit (user, 2026-11-01)
    for (let i = 0; i <= STEP_LIMIT; i++) expect(talk.check({ kind: 'read' }, WA, chat('Mom'), i).v).toBe('allow')

    const idle = started()
    expect(idle.check({ kind: 'read' }, WA, chat('Mom'), 1000).v).toBe('allow')
    expect(idle.check({ kind: 'read' }, WA, chat('Mom'), 1000 + IDLE_MS + 1)).toMatchObject({ v: 'block', stop: true })

    const ended = started()
    ended.end()
    expect(ended.check({ kind: 'read' }, WA, chat('Mom'), 1)).toMatchObject({ v: 'block', stop: false })
  })
})
