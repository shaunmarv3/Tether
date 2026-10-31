import { describe, expect, it } from 'vitest'
import { badArgs, Lines, parseRequest } from '../src/pilotlink'

const req = (o: object) => JSON.stringify({ token: 't0k', id: 1, tool: 'read_screen', args: {}, ...o })

describe('parseRequest', () => {
  it('reads a valid request', () => {
    expect(parseRequest(req({}))).toEqual({ token: 't0k', id: 1, tool: 'read_screen', args: {} })
  })
  it('rejects bad shapes', () => {
    for (const line of [req({ tool: 'rm_rf' }), req({ token: undefined }), req({ token: '' }), req({ id: 'x' }), req({ args: [] }),
      req({ args: null }), 'not json', '[]', 'null']) expect(parseRequest(line), line).toBeNull()
  })
  it('rejects huge lines', () => {
    expect(parseRequest(req({ args: { text: 'x'.repeat(70_000) } }))).toBeNull()
  })
})

describe('badArgs', () => {
  it('start_task', () => {
    const ok = { goal: 'Reply to Mom', steps: ['open chat', 'send'], apps: ['WhatsApp'] }
    expect(badArgs('start_task', ok)).toBeNull()
    expect(badArgs('start_task', { ...ok, to: 'Mom' })).toBeNull()
    expect(badArgs('start_task', { ...ok, goal: '' })).not.toBeNull()
    expect(badArgs('start_task', { ...ok, goal: 'x'.repeat(301) })).not.toBeNull()
    expect(badArgs('start_task', { ...ok, steps: [] })).not.toBeNull()
    expect(badArgs('start_task', { ...ok, steps: Array(21).fill('s') })).not.toBeNull()
    expect(badArgs('start_task', { ...ok, steps: ['x'.repeat(201)] })).not.toBeNull()
    expect(badArgs('start_task', { ...ok, apps: [] })).not.toBeNull()
    expect(badArgs('start_task', { ...ok, apps: Array(6).fill('a') })).not.toBeNull()
    expect(badArgs('start_task', { ...ok, to: 'x'.repeat(101) })).not.toBeNull()
    expect(badArgs('start_task', { ...ok, to: 5 })).not.toBeNull()
  })
  it('tap and swipe take integers 0–10000', () => {
    expect(badArgs('tap', { x: 10, y: 2000 })).toBeNull()
    for (const args of [{ x: 1.5, y: 2 }, { x: -1, y: 2 }, { x: 10_001, y: 2 }, { x: '5', y: 2 }, { x: 5 }]) expect(badArgs('tap', args)).not.toBeNull()
    expect(badArgs('swipe', { x1: 1, y1: 2, x2: 3, y2: 4 })).toBeNull()
    expect(badArgs('swipe', { x1: 1, y1: 2, x2: 3 })).not.toBeNull()
  })
  it('type, key, open_app, end_task', () => {
    expect(badArgs('type', { text: 'on my way' })).toBeNull()
    expect(badArgs('type', { text: '' })).not.toBeNull()
    expect(badArgs('type', { text: 'x'.repeat(1001) })).not.toBeNull()
    for (const key of ['back', 'home', 'enter']) expect(badArgs('key', { key })).toBeNull()
    expect(badArgs('key', { key: 'power' })).not.toBeNull()
    expect(badArgs('open_app', { app: 'WhatsApp' })).toBeNull()
    expect(badArgs('open_app', { app: '' })).not.toBeNull()
    expect(badArgs('open_app', { app: 'x'.repeat(101) })).not.toBeNull()
    expect(badArgs('end_task', { summary: 'done' })).toBeNull()
    expect(badArgs('end_task', {})).toBeNull()
    expect(badArgs('end_task', { summary: 'x'.repeat(2001) })).not.toBeNull()
  })
  it('tools without args accept {}', () => {
    for (const tool of ['list_apps', 'read_screen', 'screenshot'] as const) expect(badArgs(tool, {})).toBeNull()
  })
  it('ask_user', () => {
    expect(badArgs('ask_user', { question: 'Sam asks if you are free on Sunday. What should I say?' })).toBeNull()
    for (const question of ['', 'x'.repeat(301), 5, undefined]) expect(badArgs('ask_user', { question }), String(question)).not.toBeNull()
  })
  it('long_press and wait_for_change', () => {
    expect(badArgs('long_press', { x: 10, y: 2000 })).toBeNull()
    expect(badArgs('long_press', { x: -1, y: 0 })).not.toBeNull()
    expect(badArgs('wait_for_change', {})).toBeNull()
    expect(badArgs('wait_for_change', { timeout_s: 5 })).toBeNull()
    expect(badArgs('wait_for_change', { timeout_s: 300 })).toBeNull()
    for (const timeout_s of [4, 301, 10.5, '60']) expect(badArgs('wait_for_change', { timeout_s }), String(timeout_s)).not.toBeNull()
    expect(parseRequest(req({ tool: 'long_press', args: { x: 1, y: 2 } }))).not.toBeNull()
    expect(parseRequest(req({ tool: 'wait_for_change' }))).not.toBeNull()
  })
})

describe('Lines', () => {
  it('splits across chunks and CRLF', () => {
    const l = new Lines()
    expect(l.push('{"a":1}\r\n{"b"')).toEqual(['{"a":1}'])
    expect(l.push(':2}\n\n{"c":3}\n')).toEqual(['{"b":2}', '{"c":3}'])
    expect(l.push('tail')).toEqual([])
  })
})
