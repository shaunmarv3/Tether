import { describe, expect, it } from 'vitest'
import { parseNewest, ShotTracker } from '../src/shots'

const A = { path: '/sdcard/Pictures/Screenshots/Screenshot_1.png', size: 600, mtime: 100 }
const B = { path: '/sdcard/Pictures/Screenshots/Screenshot_2.png', size: 100, mtime: 200 }
const C = { path: '/sdcard/DCIM/Screenshots/Screenshot_3.png', size: 50, mtime: 300 }

describe('parseNewest', () => {
  it('reads path + size', () => {
    expect(parseNewest(`${A.path}\n600 100\n`)).toEqual(A)
    expect(parseNewest(`${A.path}\r\n600 100\r\n`)).toEqual(A)
  })
  it('anything else is null', () => {
    for (const out of ['', '\n', 'garbage', `${A.path}\nbig\n`, `${A.path}\n600\n`, '/data/secret.png\n5 1\n']) expect(parseNewest(out), out).toBeNull()
  })
})

describe('ShotTracker', () => {
  it('first sighting is the baseline', () => {
    expect(new ShotTracker().see(A)).toBeNull()
  })
  it('new file waits for a steady size', () => {
    const t = new ShotTracker()
    t.see(A)
    expect(t.see(B)).toBeNull()
    expect(t.see({ ...B, size: 300 })).toBeNull() // still being written
    expect(t.see({ ...B, size: 300 })).toBe(B.path)
  })
  it('copies once', () => {
    const t = new ShotTracker()
    t.see(A); t.see(B)
    expect(t.see(B)).toBe(B.path)
    expect(t.see(B)).toBeNull()
  })
  it('reset makes the current file the baseline', () => {
    const t = new ShotTracker()
    t.see(A)
    t.reset()
    expect(t.see(C)).toBeNull()
    expect(t.see(C)).toBeNull()
  })
  it('null keeps the baseline', () => {
    const t = new ShotTracker()
    t.see(A)
    expect(t.see(null)).toBeNull() // a failed check doesn't forget A
    expect(t.see(A)).toBeNull()
    expect(t.see(A)).toBeNull()
  })
  it('deleting the newest file does not re-copy an older one', () => {
    const t = new ShotTracker()
    t.see(A); t.see(B); t.see(B) // B copied
    t.see(C); t.see(C) // C copied
    expect(t.see(B)).toBeNull() // C deleted on the phone: B is the newest again
    expect(t.see(B)).toBeNull()
    expect(t.see(A)).toBeNull()
  })

  it('an empty folder at start still catches the first screenshot', () => {
    const t = new ShotTracker()
    t.see(null)
    expect(t.see(B)).toBeNull()
    expect(t.see(B)).toBe(B.path)
  })
})
