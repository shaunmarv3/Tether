import { describe, expect, it } from 'vitest'
import { formatScreen, nodeAt, parseFocus, parseUiDump, screenPackage, type UiNode } from '../src/ui'

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
