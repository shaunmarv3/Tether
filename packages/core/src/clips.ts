// Clipboard sync decisions: which text crosses, which is a one-time code, when to wipe it. Pure.
import { CLIPBOARD_MAX } from './protocol'

const CODE_WORDS = /\b(code|otp|verification|one[- ]time|pin|passcode)\b/i

export function isOneTimeCode(text: string): boolean {
  const t = text.trim()
  if (t.length > 80) return false
  if (/^\d[\d -]{2,9}\d$/.test(t)) {
    const digits = t.replace(/\D/g, '').length
    return digits >= 4 && digits <= 8
  }
  const groups = t.match(/(?<![\d/#.])\d{4,8}(?![\d/])/g) ?? []
  return groups.length === 1 && CODE_WORDS.test(t)
}

// Each text crosses once: the last text seen either way is never sent back (no echo loop).
export class ClipSync {
  private last: string | null = null

  fromPhone(text: string): { writePc: boolean; secret: boolean } {
    const writePc = text !== this.last
    this.last = text
    return { writePc, secret: isOneTimeCode(text) }
  }

  fromPc(text: string): { sendPhone: boolean; tooBig: boolean } {
    if (text === this.last) return { sendPhone: false, tooBig: false }
    this.last = text
    const tooBig = Buffer.byteLength(text, 'utf8') > CLIPBOARD_MAX
    return { sendPhone: !tooBig, tooBig }
  }

  shouldWipe(currentPcText: string, code: string): boolean {
    return currentPcText === code
  }
}
