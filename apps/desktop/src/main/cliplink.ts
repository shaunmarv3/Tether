// Clipboard sync over a small control-only scrcpy link (no video, no audio). Runs while TETHER is unlocked and a known
// phone is ready; also carries Paste to phone and Screen off. One-time codes never reach the renderer or the log.
import { clipboard, ClipboardItem } from 'electron'
import { ClipSync, CLIPBOARD_MAX, enc, isOneTimeCode, PhoneStream, type DeviceEvent, type EnginePaths } from '@tether/core'
import type { Clip, ClipLinkState, ClipSettings } from '../shared/api'

const raw = (format: string) => `electron application/osclipboard;format="${format}"`
const PREVIEW = 300 // chars of a clip the renderer gets

// Spike B (2026-10-30): one atomic write with CanIncludeInClipboardHistory = 0 keeps the text out of Win+V history.
async function writePc(text: string, offHistory: boolean): Promise<void> {
  if (!offHistory) return clipboard.writeText(text)
  const zero = () => new Blob([new Uint8Array(4)])
  await clipboard.write([new ClipboardItem({
    'text/plain': text,
    [raw('ExcludeClipboardContentFromMonitorProcessing')]: new Blob([]),
    [raw('CanIncludeInClipboardHistory')]: zero(),
    [raw('CanUploadToCloudClipboard')]: zero(),
  })])
}

// A phone screenshot as an image, kept out of Win+V history / cloud clipboard the same way when asked.
export async function writePcImage(png: Uint8Array<ArrayBuffer>, offHistory: boolean): Promise<void> {
  const zero = () => new Blob([new Uint8Array(4)])
  await clipboard.write([new ClipboardItem({
    'image/png': new Blob([png], { type: 'image/png' }),
    ...(offHistory ? {
      [raw('ExcludeClipboardContentFromMonitorProcessing')]: new Blob([]),
      [raw('CanIncludeInClipboardHistory')]: zero(),
      [raw('CanUploadToCloudClipboard')]: zero(),
    } : {}),
  })])
}

const readPc = () => clipboard.readText().catch(() => '')

export interface ClipDeps {
  engine(): EnginePaths | null
  serial(): string | null // null while locked or with no known phone ready
  settings(): ClipSettings
  log(line: string): void
  onChange(): void
}

export class ClipLink {
  state: ClipLinkState = 'off'
  clips: Clip[] = []
  stats = { synced: 0, wiped: 0 }
  private texts = new Map<number, string>() // full text by clip id (memory only)
  private stream: PhoneStream | null = null
  private serialOn: string | null = null
  private timer: NodeJS.Timeout | null = null
  private poll: NodeJS.Timeout | null = null
  private sync = new ClipSync()
  private pcSeen = ''
  private nextId = 1

  constructor(private deps: ClipDeps) {}

  // Call after anything that changes lock, phone or engine.
  update(): void {
    const serial = this.deps.engine() ? this.deps.serial() : null
    if (serial === this.serialOn) return
    this.stop()
    if (!serial) return
    this.serialOn = serial
    this.set('starting')
    this.timer = setTimeout(() => void this.start(serial), 3000)
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer)
    if (this.poll) clearInterval(this.poll)
    this.timer = this.poll = null
    const s = this.stream
    this.stream = null
    s?.close()
    this.serialOn = null
    this.set('off')
  }

  // On lock: history goes (codes already on the PC clipboard still get wiped by their timers).
  clear(): void {
    this.clips = []
    this.texts.clear()
    this.deps.onChange()
  }

  private set(s: ClipLinkState): void {
    if (this.state === s) return
    this.state = s
    this.deps.onChange()
  }

  private async start(serial: string): Promise<void> {
    this.timer = null
    const engine = this.deps.engine()
    if (!engine || this.serialOn !== serial) return
    const stream = new PhoneStream(engine, serial,
      { video: false, audio: false, control: true, keepActive: false, powerOn: false, clipboard: true, display: null })
    this.stream = stream
    stream.on('device', (e: DeviceEvent) => { if (e.type === 'clipboard') void this.fromPhone(e.text) })
    stream.once('close', (error: string | null) => {
      if (this.stream !== stream) return // stopped on purpose
      this.stream = null
      if (this.poll) clearInterval(this.poll)
      this.poll = null
      this.deps.log(`clip link closed: ${error ?? 'ended'}`)
      this.set('error')
      // Cable pulled, phone rebooted…: try again while this phone is still the one to sync with.
      this.timer = setTimeout(() => void this.start(serial), 5000)
    })
    try {
      await stream.start()
    } catch {
      return // 'close' handled it
    }
    if (this.stream !== stream) return
    this.pcSeen = await readPc() // what is on the PC already is not news
    this.poll = setInterval(() => void this.pollPc(), 1000)
    this.set('on')
  }

  // A phone screenshot went onto the PC clipboard as an image (not part of the text sync; size = file bytes).
  noteImage(size: number): void {
    this.add('phone', 'PHONE SCREENSHOT', false, 'IMAGE').size = size
    this.deps.onChange()
  }

  private add(dir: 'phone' | 'pc', text: string, secret: boolean, note: string | null = null): Clip {
    const clip: Clip = {
      id: this.nextId++, dir, text: secret ? null : text.slice(0, PREVIEW), secret, size: Buffer.byteLength(text),
      at: new Date().toISOString(), wipeAt: null, note,
    }
    this.texts.set(clip.id, text)
    this.clips = [clip, ...this.clips]
    for (const old of this.clips.splice(20)) this.texts.delete(old.id)
    if (!note) this.stats.synced++
    this.deps.onChange()
    return clip
  }

  private async fromPhone(text: string): Promise<void> {
    const s = this.deps.settings()
    if (!s.sync) return
    const { writePc: write, secret } = this.sync.fromPhone(text)
    if (!write) return
    const hidden = secret && s.hideCodes
    await writePc(text, s.keepOutOfHistory || hidden) // codes always stay out of Win+V (rule 9)
    this.pcSeen = text
    const clip = this.add('phone', text, hidden)
    if (!hidden) return
    clip.wipeAt = new Date(Date.now() + s.wipeSeconds * 1000).toISOString()
    setTimeout(() => void this.wipe(clip, text), s.wipeSeconds * 1000)
  }

  // Only if the PC clipboard still holds the code: something copied since then is left alone.
  private async wipe(clip: Clip, code: string): Promise<void> {
    if (this.sync.shouldWipe(await readPc(), code)) {
      clipboard.clear()
      this.stats.wiped++
    }
    Object.assign(clip, { wipeAt: null, note: 'WIPED' })
    this.texts.delete(clip.id)
    this.deps.onChange()
  }

  private async pollPc(): Promise<void> {
    if (!this.deps.settings().sync) return
    const text = await readPc()
    if (!text || text === this.pcSeen) return
    this.pcSeen = text
    const { sendPhone, tooBig } = this.sync.fromPc(text)
    const secret = this.deps.settings().hideCodes && isOneTimeCode(text)
    if (tooBig) this.add('pc', text, secret, 'TOO BIG TO SEND')
    else if (sendPhone && this.stream?.send(enc.setClipboard(0, text, false))) this.add('pc', text, secret)
  }

  // --- actions (renderer) ---

  private send(msg: Uint8Array): void {
    if (!this.stream?.send(msg)) throw new Error('PHONE LINK NOT READY')
  }

  async pasteToPhone(): Promise<void> {
    const text = await readPc()
    if (!text) throw new Error('PC CLIPBOARD IS EMPTY')
    this.typeText(text)
  }

  // Paste text into the focused phone field (AI pilot typing: works for any language and emoji, unlike `input text`).
  typeText(text: string): void {
    if (Buffer.byteLength(text) > CLIPBOARD_MAX) throw new Error('TOO BIG TO SEND')
    this.sync.fromPc(text) // so the phone's echo isn't written back
    this.send(enc.setClipboard(0, text, true))
  }

  async copyClip(id: number): Promise<void> {
    const text = this.texts.get(id)
    const clip = this.clips.find((c) => c.id === id)
    if (!text || !clip) throw new Error('CLIP GONE')
    this.pcSeen = text
    this.sync.fromPc(text)
    await writePc(text, clip.secret)
  }

  sendClip(id: number): void {
    const text = this.texts.get(id)
    if (!text) throw new Error('CLIP GONE')
    if (Buffer.byteLength(text) > CLIPBOARD_MAX) throw new Error('TOO BIG TO SEND')
    this.sync.fromPc(text)
    this.send(enc.setClipboard(0, text, false))
  }

  screenOff(): void {
    this.send(enc.displayPower(false))
  }
}
