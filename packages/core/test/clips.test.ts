import { describe, expect, it } from 'vitest'
import { ClipSync, isOneTimeCode } from '../src/clips'

describe('isOneTimeCode', () => {
  it('spots codes', () => {
    for (const t of ['482913', '482 913', 'Your OTP is 482913', 'G-482913 is your Google verification code', 'PIN: 4829']) {
      expect(isOneTimeCode(t), t).toBe(true)
    }
  })
  it('leaves normal text alone', () => {
    for (const t of ['Meet at 7, near the station', 'Order #A-20931', 'https://x.com/tickets/4821', 'call 9876543210',
      'Your code is 482913. ' + 'x'.repeat(200)]) {
      expect(isOneTimeCode(t), t).toBe(false)
    }
  })
})

describe('ClipSync', () => {
  it('a phone clip is not sent back', () => {
    const s = new ClipSync()
    expect(s.fromPhone('a')).toEqual({ writePc: true, secret: false })
    expect(s.fromPc('a')).toEqual({ sendPhone: false, tooBig: false })
  })
  it('a PC clip is not written back', () => {
    const s = new ClipSync()
    expect(s.fromPc('b')).toEqual({ sendPhone: true, tooBig: false })
    expect(s.fromPc('b').sendPhone).toBe(false)
    expect(s.fromPhone('b').writePc).toBe(false)
  })
  it('marks codes secret', () => {
    expect(new ClipSync().fromPhone('Your OTP is 482913').secret).toBe(true)
  })
  it('does not send huge text', () => {
    expect(new ClipSync().fromPc('a'.repeat(262_131))).toEqual({ sendPhone: false, tooBig: true })
  })
  it('wipes only a code that is still there', () => {
    const s = new ClipSync()
    expect(s.shouldWipe('482913', '482913')).toBe(true)
    expect(s.shouldWipe('other', '482913')).toBe(false)
  })
})
