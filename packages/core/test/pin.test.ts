import { describe, expect, it } from 'vitest'
import { hashPin, isPin, PinGate, verifyPin } from '../src/pin'

describe('isPin', () => {
  it('accepts 4-8 digits', () => {
    expect(isPin('1234')).toBe(true)
    expect(isPin('12345678')).toBe(true)
  })
  it('rejects everything else', () => {
    for (const p of ['123', '123456789', '12a4', 1234, null]) expect(isPin(p)).toBe(false)
  })
})

describe('hashPin / verifyPin', () => {
  it('salts every hash', () => {
    expect(hashPin('1234')).not.toBe(hashPin('1234'))
    expect(hashPin('1234')).toMatch(/^scrypt\$[0-9a-f]+\$[0-9a-f]+$/)
  })
  it('verifies right and wrong PINs', () => {
    const h = hashPin('1234')
    expect(verifyPin('1234', h)).toBe(true)
    expect(verifyPin('4321', h)).toBe(false)
  })
  it('returns false for malformed stored strings', () => {
    expect(verifyPin('1234', '')).toBe(false)
    expect(verifyPin('1234', 'scrypt$zz')).toBe(false)
  })
})

describe('PinGate', () => {
  it('makes you wait 30 s after 5 wrong tries', () => {
    const gate = new PinGate(hashPin('1234'))
    const now = 1_000_000
    for (let i = 0; i < 5; i++) expect(gate.tryUnlock('9999', now)).toBe('wrong')
    expect(gate.tryUnlock('1234', now)).toBe('wait')
    expect(gate.tryUnlock('1234', now + 30_001)).toBe('ok')
    for (let i = 0; i < 4; i++) expect(gate.tryUnlock('9999', now + 30_002)).toBe('wrong')
    expect(gate.tryUnlock('1234', now + 30_002)).toBe('ok')
  })
})
