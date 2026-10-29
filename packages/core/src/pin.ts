// App-lock PIN: scrypt hash with a random salt, plus a try limiter.
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

export function isPin(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4,8}$/.test(s)
}

export function hashPin(pin: string): string {
  const salt = randomBytes(16)
  return `scrypt$${salt.toString('hex')}$${scryptSync(pin, salt, 32).toString('hex')}`
}

export function verifyPin(pin: string, stored: string): boolean {
  const [kind, saltHex, keyHex] = stored.split('$')
  if (kind !== 'scrypt' || !/^[0-9a-f]+$/.test(saltHex ?? '') || !/^[0-9a-f]{64}$/.test(keyHex ?? '')) return false
  return timingSafeEqual(scryptSync(pin, Buffer.from(saltHex, 'hex'), 32), Buffer.from(keyHex, 'hex'))
}

export class PinGate {
  private failures = 0
  private waitUntil = 0

  constructor(private stored: string, private maxTries = 5, private waitMs = 30_000) {}

  tryUnlock(pin: string, now = Date.now()): 'ok' | 'wrong' | 'wait' {
    if (now < this.waitUntil) return 'wait'
    if (verifyPin(pin, this.stored)) {
      this.failures = 0
      return 'ok'
    }
    if (++this.failures >= this.maxTries) {
      this.failures = 0
      this.waitUntil = now + this.waitMs
    }
    return 'wrong'
  }
}
