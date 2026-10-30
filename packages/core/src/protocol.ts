// scrcpy 5.0 wire format (verified against the v5.0 sources, see the M3 plan). Pure: no I/O here.
import { isPackage } from './apps'

export const SERVER_VERSION = '5.0'

export type StreamEvent =
  | { type: 'codec'; id: number } // 0 = stream disabled, 1 = config error
  | { type: 'session'; width: number; height: number }
  | { type: 'packet'; config: boolean; key: boolean; pts: number; data: Uint8Array }

// Turns socket chunks into events. Video: codec id, then 12-byte headers (session or media packet).
export class StreamReader {
  private buf = new Uint8Array(0)
  private gotCodec = false
  private size = -1 // payload size of the media packet whose header was read
  private meta = { config: false, key: false, pts: 0 }

  constructor(private opts: { session: boolean } = { session: true }) {}

  feed(chunk: Uint8Array): StreamEvent[] {
    const joined = new Uint8Array(this.buf.length + chunk.length)
    joined.set(this.buf)
    joined.set(chunk, this.buf.length)
    const view = new DataView(joined.buffer)
    const events: StreamEvent[] = []
    let at = 0
    for (;;) {
      if (!this.gotCodec) {
        if (joined.length - at < 4) break
        events.push({ type: 'codec', id: view.getUint32(at) })
        this.gotCodec = true
        at += 4
      } else if (this.size >= 0) {
        if (joined.length - at < this.size) break
        events.push({ type: 'packet', ...this.meta, data: joined.slice(at, at + this.size) })
        at += this.size
        this.size = -1
      } else {
        if (joined.length - at < 12) break
        const hi = view.getUint32(at)
        if (this.opts.session && hi & 0x80000000) {
          events.push({ type: 'session', width: view.getUint32(at + 4), height: view.getUint32(at + 8) })
        } else {
          const lo = view.getUint32(at + 4)
          this.meta = { config: !!(hi & 0x40000000), key: !!(hi & 0x20000000), pts: (hi & 0x1fffffff) * 2 ** 32 + lo }
          if (this.meta.config) this.meta.pts = 0
          this.size = view.getUint32(at + 8)
        }
        at += 12
      }
    }
    this.buf = joined.slice(at)
    return events
  }
}

export type DeviceEvent = { type: 'clipboard'; text: string } | { type: 'ack'; seq: number }

// Device → PC messages on the control socket: [0, len u32, utf8] clipboard · [1, seq u64] ack · [2, id u16, len u16, data] uhid.
export class DeviceReader {
  private buf = new Uint8Array(0)

  feed(chunk: Uint8Array): DeviceEvent[] {
    const joined = new Uint8Array(this.buf.length + chunk.length)
    joined.set(this.buf)
    joined.set(chunk, this.buf.length)
    const view = new DataView(joined.buffer)
    const events: DeviceEvent[] = []
    let at = 0
    for (;;) {
      const left = joined.length - at
      if (left < 1) break
      const type = joined[at]
      if (type === 0) {
        if (left < 5 || left < 5 + view.getUint32(at + 1)) break
        const len = view.getUint32(at + 1)
        events.push({ type: 'clipboard', text: new TextDecoder().decode(joined.subarray(at + 5, at + 5 + len)) })
        at += 5 + len
      } else if (type === 1) {
        if (left < 9) break
        events.push({ type: 'ack', seq: Number(view.getBigUint64(at + 1)) })
        at += 9
      } else if (type === 2) {
        if (left < 5 || left < 5 + view.getUint16(at + 3)) break
        at += 5 + view.getUint16(at + 3)
      } else {
        throw new Error(`unknown device message ${type}`)
      }
    }
    this.buf = joined.slice(at)
    return events
  }
}

// 'avc1.PPCCLL' from the SPS NAL (type 7) of an Annex-B config packet, for WebCodecs.
export function codecString(config: Uint8Array): string {
  for (let i = 0; i + 6 < config.length; i++) {
    if (config[i] === 0 && config[i + 1] === 0 && config[i + 2] === 1 && (config[i + 3] & 0x1f) === 7) {
      return 'avc1.' + [...config.slice(i + 4, i + 7)].map((b) => b.toString(16).padStart(2, '0')).join('')
    }
  }
  throw new Error('no SPS in config packet')
}

export interface DisplayOptions {
  size: [number, number] | null; dpi: number | null; flex: boolean
  keepContent: boolean; decorations: boolean; ime: 'local' | 'hide'
}
export interface ServerOptions {
  scid: string; video: boolean; audio: boolean; control: boolean; keepActive: boolean; powerOn: boolean
  clipboard: boolean // phone clipboard changes are sent to TETHER
  display: DisplayOptions | null // null = the phone's main display
}

const isInt = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max

export function serverArgs(o: ServerOptions): string[] {
  if (!/^[0-9a-f]{8}$/.test(o.scid)) throw new Error(`bad scid: ${o.scid}`)
  const args = [SERVER_VERSION, `scid=${o.scid}`, 'log_level=info', `video=${o.video}`, `audio=${o.audio}`, `control=${o.control}`,
    'tunnel_forward=true', 'send_device_meta=false', 'video_codec=h264', 'audio_codec=raw', `clipboard_autosync=${o.clipboard}`,
    `keep_active=${o.keepActive}`, `power_on=${o.powerOn}`]
  const d = o.display
  if (d) {
    if (d.size && !(isInt(d.size[0], 2, 8192) && isInt(d.size[1], 2, 8192))) throw new Error('bad display size')
    if (d.dpi !== null && !isInt(d.dpi, 60, 960)) throw new Error('bad dpi')
    const size = d.size ? `${d.size[0]}x${d.size[1]}` : ''
    args.push(`new_display=${size}${d.dpi ? `/${d.dpi}` : ''}`, `flex_display=${d.flex}`, `vd_destroy_content=${!d.keepContent}`,
      `vd_system_decorations=${d.decorations}`, `display_ime_policy=${d.ime === 'hide' ? 'hide' : 'local'}`)
  }
  return args
}

// Control messages, client → server, big-endian.
function bytes(n: number, fill: (v: DataView) => void): Uint8Array {
  const b = new Uint8Array(n)
  fill(new DataView(b.buffer))
  return b
}
function position(v: DataView, at: number, x: number, y: number, w: number, h: number): void {
  if (!isInt(w, 1, 65535) || !isInt(h, 1, 65535) || !isInt(x, 0, w) || !isInt(y, 0, h)) throw new Error('bad position')
  v.setInt32(at, x); v.setInt32(at + 4, y); v.setUint16(at + 8, w); v.setUint16(at + 10, h)
}
const utf8 = new TextEncoder()
export const CLIPBOARD_MAX = 262_130 // bytes of UTF-8 (scrcpy CLIPBOARD_TEXT_MAX_LENGTH)

export const enc = {
  key(action: 0 | 1, keycode: number): Uint8Array {
    if (!isInt(keycode, 0, 400)) throw new Error('bad keycode')
    return bytes(14, (v) => { v.setUint8(0, 0); v.setUint8(1, action); v.setUint32(2, keycode) })
  },
  text(text: string): Uint8Array {
    const t = utf8.encode(text)
    if (!t.length || t.length > 300) throw new Error('bad text length')
    const b = bytes(5 + t.length, (v) => { v.setUint8(0, 1); v.setUint32(1, t.length) })
    b.set(t, 5)
    return b
  },
  // A finger touch (pointer id -2 = generic finger), like a tap on the glass.
  touch(action: 0 | 1 | 2, x: number, y: number, w: number, h: number): Uint8Array {
    return bytes(32, (v) => {
      v.setUint8(0, 2); v.setUint8(1, action); v.setBigInt64(2, -2n)
      position(v, 10, x, y, w, h)
      v.setUint16(22, action === 1 ? 0 : 0xffff)
    })
  },
  // hs/vs in [-16, 16], sent as signed 16-bit fixed point of value / 16.
  scroll(x: number, y: number, w: number, h: number, hs: number, vs: number): Uint8Array {
    const fp = (s: number) => {
      if (!Number.isFinite(s)) throw new Error('bad scroll')
      return Math.min(0x7fff, Math.round((Math.max(-16, Math.min(16, s)) / 16) * 0x8000))
    }
    return bytes(21, (v) => { v.setUint8(0, 3); position(v, 1, x, y, w, h); v.setInt16(13, fp(hs)); v.setInt16(15, fp(vs)) })
  },
  // copyKey: 0 none, 1 copy, 2 cut (pressed on the phone first).
  getClipboard(copyKey: 0 | 1 | 2): Uint8Array {
    return Uint8Array.of(8, copyKey)
  },
  // seq 0 = no ack. paste = also paste it into the focused phone field.
  setClipboard(seq: number, text: string, paste: boolean): Uint8Array {
    const t = utf8.encode(text)
    if (!t.length || t.length > CLIPBOARD_MAX) throw new Error('bad clipboard length')
    const b = bytes(14 + t.length, (v) => { v.setUint8(0, 9); v.setBigUint64(1, BigInt(seq)); v.setUint8(9, paste ? 1 : 0); v.setUint32(10, t.length) })
    b.set(t, 14)
    return b
  },
  displayPower(on: boolean): Uint8Array {
    return Uint8Array.of(10, on ? 1 : 0)
  },
  startApp(pkg: string): Uint8Array {
    if (!isPackage(pkg)) throw new Error(`bad package: ${pkg}`)
    const t = utf8.encode(pkg)
    return Uint8Array.of(16, t.length, ...t)
  },
  // Turn the phone screen a quarter (portrait ↔ landscape), like turning the phone.
  rotate(): Uint8Array {
    return Uint8Array.of(11)
  },
  // Ask for a fresh encoder session (new config + key frame), e.g. after a decoder error.
  resetVideo(): Uint8Array {
    return Uint8Array.of(17)
  },
  resize(w: number, h: number): Uint8Array {
    if (!isInt(w, 2, 8192) || !isInt(h, 2, 8192)) throw new Error('bad size')
    return bytes(5, (v) => { v.setUint8(0, 21); v.setUint16(1, w); v.setUint16(3, h) })
  },
}
