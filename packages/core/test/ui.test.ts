import { describe, expect, it } from 'vitest'
import { formatScreen, nodeAt, parseFocus, parseKeyguard, parseTaskOwner, parsePopups, parseUiDump, screenPackage, type UiNode } from '../src/ui'

// Synthetic dump (shape of `uiautomator dump`), never a real one.
const node = (attrs: string) => `<node index="0" ${attrs} checkable="false" checked="false" enabled="true" focusable="true" scrollable="false" long-clickable="false" selected="false">`
const DUMP = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="0">`
  + node('text="" resource-id="" class="android.widget.FrameLayout" package="com.whatsapp" content-desc="" clickable="false" focused="false" password="false" bounds="[0,0][1080,2400]"')
  + node('text="Tom &amp; Jerry &lt;3 &quot;hi&quot;&#10;2nd" resource-id="com.whatsapp:id/conversation_contact_name" class="android.widget.TextView" package="com.whatsapp" content-desc="" clickable="false" focused="false" password="false" bounds="[200,100][700,180]"')
  + '</node>'
  + node('text="on my way" resource-id="com.whatsapp:id/entry" class="android.widget.EditText" package="com.whatsapp" content-desc="" clickable="true" focused="true" password="false" bounds="[40,2200][900,2320]"')
  + '</node>'
  + node('text="" resource-id="com.whatsapp:id/send" class="android.widget.ImageButton" package="com.whatsapp" content-desc="Send" clickable="true" focused="false" password="false" bounds="[920,2200][1060,2320]"')
  + '</node>'
  + '</node></hierarchy>\nUI hierchary dumped to: /dev/tty\n'

describe('parseUiDump', () => {
  it('parses nodes', () => {
    const nodes = parseUiDump(DUMP)!
    expect(nodes).toHaveLength(4)
    expect(nodes[1]).toEqual({
      text: 'Tom & Jerry <3 "hi"\n2nd', desc: '', id: 'com.whatsapp:id/conversation_contact_name', cls: 'android.widget.TextView',
      pkg: 'com.whatsapp', bounds: [200, 100, 700, 180], clickable: false, editable: false, focused: false, password: false,
    })
    expect(nodes[2]).toMatchObject({ text: 'on my way', editable: true, focused: true, clickable: true })
    expect(nodes[3]).toMatchObject({ desc: 'Send', id: 'com.whatsapp:id/send', bounds: [920, 2200, 1060, 2320] })
  })
  it('reads password fields', () => {
    const nodes = parseUiDump(`<hierarchy>${node('text="secret" resource-id="" class="android.widget.EditText" package="p" content-desc="" clickable="true" focused="false" password="true" bounds="[0,0][10,10]"')}</node></hierarchy>`)!
    expect(nodes[0].password).toBe(true)
  })
  it('no hierarchy is null', () => {
    expect(parseUiDump('')).toBeNull()
    expect(parseUiDump('ERROR: could not get idle state.')).toBeNull()
  })
})

describe('screenPackage', () => {
  it('is the first node package', () => {
    expect(screenPackage(parseUiDump(DUMP)!)).toBe('com.whatsapp')
    expect(screenPackage([])).toBeNull()
  })
})

describe('nodeAt', () => {
  const box = (bounds: UiNode['bounds'], clickable: boolean, text = ''): UiNode =>
    ({ text, desc: '', id: '', cls: 'View', pkg: 'p', bounds, clickable, editable: false, focused: false, password: false })
  it('picks the smallest clickable', () => {
    const row = box([0, 0, 1000, 200], true, 'row')
    const button = box([800, 50, 950, 150], true, 'button')
    const label = box([810, 60, 900, 140], false, 'label')
    expect(nodeAt([row, button, label], 850, 100)).toBe(button)
    expect(nodeAt([row, button, label], 100, 100)).toBe(row)
  })
  it('falls back to the smallest node', () => {
    const big = box([0, 0, 1000, 1000], false)
    const small = box([0, 0, 100, 100], false)
    expect(nodeAt([big, small], 50, 50)).toBe(small)
  })
  it('outside everything is null', () => {
    expect(nodeAt([box([0, 0, 10, 10], true)], 500, 500)).toBeNull()
  })
})

describe('parseFocus', () => {
  it('reads the focused package', () => {
    expect(parseFocus('Window manager\n  mCurrentFocus=Window{1a2b u0 com.whatsapp/com.whatsapp.Conversation}\n')).toBe('com.whatsapp')
    expect(parseFocus('  mCurrentFocus=Window{9f u0 NotificationShade}')).toBeNull()
    expect(parseFocus('nothing here')).toBeNull()
  })
})

describe('parseUiDump quotes', () => {
  it("reads attributes the phone writes with single quotes (text containing \")", () => {
    const xml = `<hierarchy>${node(`text='we "know" it&apos;s' resource-id="" class="android.widget.EditText" package="p" content-desc="" clickable="true" focused="true" password="false" bounds="[0,0][10,10]"`)}</node></hierarchy>`
    expect(parseUiDump(xml)).toMatchObject([{ text: `we "know" it's`, cls: 'android.widget.EditText', focused: true, bounds: [0, 0, 10, 10] }])
  })
})

describe('parseKeyguard', () => {
  it('reads whether the lock screen is showing', () => {
    expect(parseKeyguard('  KeyguardServiceDelegate\n    showing=true\n    showingAndNotOccluded=true\n')).toBe(true)
    expect(parseKeyguard('  KeyguardServiceDelegate\n    showing=false\n')).toBe(false)
    expect(parseKeyguard('nothing here')).toBe(false)
  })
})

describe('parsePopups', () => {
  // Shape of a visible WhatsApp reaction row in `dumpsys window` (Android 16, 2026-11-01), trimmed.
  const block = (name: string, visible: boolean) => `  Window #9 Window{cdfc745 u0 ${name}}:
    mOwnerUid=10225 showForAllUsers=false package=com.whatsapp appop=NONE
    mAttrs={(0,1974)(1080xwrap) gr=TOP START CENTER ty=APPLICATION_PANEL fmt=TRANSPARENT
      fl=NOT_FOCUSABLE NOT_TOUCH_MODAL}
    Requested w=1080 h=207 mLayoutSeq=263078
    mHasSurface=true isReadyForDisplay()=true mWindowRemovalAllowed=false
    isVisible=${visible}
  Window #10 Window{333664e u0 InputMethod}:
    mOwnerUid=10100 package=com.nothing.ime
`
  it('finds visible popup windows the screen dump misses', () => {
    expect(parsePopups(block('PopupWindow:ae99f7b', true))).toEqual([{ pkg: 'com.whatsapp', bounds: [0, 1974, 1080, 2181] }])
    expect(parsePopups(block('PopupWindow:ae99f7b', false))).toEqual([])
    expect(parsePopups(block('com.whatsapp/com.whatsapp.Conversation', true))).toEqual([])
    expect(parsePopups('nothing here')).toEqual([])
  })
})

describe('formatScreen', () => {
  it('lists useful nodes with centres', () => {
    const text = formatScreen(parseUiDump(DUMP)!)
    const lines = text.split('\n')
    expect(lines).toHaveLength(3) // the empty FrameLayout is skipped
    expect(lines[0]).toContain('TextView "Tom & Jerry <3 "hi" 2nd"')
    expect(lines[0]).toContain('id=conversation_contact_name')
    expect(lines[0]).toContain('@450,140')
    expect(lines[1]).toMatch(/EditText "on my way" .*@470,2260 clickable editable focused/)
    expect(lines[2]).toContain('ImageButton [Send] id=send @990,2260 clickable')
  })
  it('hides passwords', () => {
    const nodes = parseUiDump(`<hierarchy>${node('text="hunter2" resource-id="" class="android.widget.EditText" package="p" content-desc="" clickable="true" focused="false" password="true" bounds="[0,0][10,10]"')}</node></hierarchy>`)!
    expect(formatScreen(nodes)).not.toContain('hunter2')
    expect(formatScreen(nodes)).toContain('•••')
  })
})

describe('parseTaskOwner', () => {
  // Shape of `dumpsys activity activities` on the CMF Phone 1 (Android 16): Gemini's stub task showing the Google app.
  const out = [
    '  * Task{cd7dd22 #4525 type=standard I=com.google.android.apps.bard/.shellapp.BardEntryPointActivity U=0 visible=true sz=1}',
    '    topResumedActivity=ActivityRecord{158163853 u0 com.google.android.googlequicksearchbox/com.x.MainActivity t4525}',
    '  * Task{1d8d208 #4524 type=standard A=10251:com.anthropic.claude U=0 visible=false sz=1}',
  ].join('\n')
  it('reads who started the task in front', () => {
    expect(parseTaskOwner(out)).toBe('com.google.android.apps.bard')
    expect(parseTaskOwner(out.replace('t4525}', 't4524}'))).toBe('com.anthropic.claude') // affinity when there is no I=
    expect(parseTaskOwner('nothing here')).toBeNull()
  })
})
