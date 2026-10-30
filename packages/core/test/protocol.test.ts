import { describe, expect, it } from 'vitest'
import { codecString, DeviceReader, enc, serverArgs, StreamReader, type ServerOptions } from '../src/protocol'

const hex = (s: string) => Uint8Array.from(s.replace(/\s/g, '').match(/../g)!.map((b) => parseInt(b, 16)))
const toHex = (b: Uint8Array) => Buffer.from(b).toString('hex')

const CODEC = '68323634'
const SESSION = '80000000 00000438 00000960' // 1080 × 2400
const CONFIG = '4000000000000000 00000005 0000000167' // config flag, 5-byte payload
const KEY = '20000000000004d2 00000002 abcd' // key flag, pts 1234

describe('StreamReader', () => {
  it('reads codec, session, config and key-frame packets', () => {
    const events = new StreamReader().feed(hex(CODEC + SESSION + CONFIG + KEY))
    expect(events).toEqual([
      { type: 'codec', id: 0x68323634 },
      { type: 'session', width: 1080, height: 2400 },
      { type: 'packet', config: true, key: false, pts: 0, data: hex('0000000167') },
      { type: 'packet', config: false, key: true, pts: 1234, data: hex('abcd') },
    ])
  })

  it('gives the same events when fed one byte at a time', () => {
    const all = hex(CODEC + SESSION + CONFIG + KEY)
    const r = new StreamReader()
    const events = [...all].flatMap((b) => r.feed(Uint8Array.of(b)))
    expect(events).toEqual(new StreamReader().feed(all))
  })

  it('reports a rotation as a second session packet', () => {
    const events = new StreamReader().feed(hex(CODEC + SESSION + '80000000 00000960 00000438'))
    expect(events.at(-1)).toEqual({ type: 'session', width: 2400, height: 1080 })
  })

  it('reads audio (no session packets) and a disabled stream', () => {
    const audio = new StreamReader({ session: false }).feed(hex('00726177' + '0000000000000064 00000002 0102'))
    expect(audio).toEqual([{ type: 'codec', id: 0x00726177 }, { type: 'packet', config: false, key: false, pts: 100, data: hex('0102') }])
    expect(new StreamReader({ session: false }).feed(hex('00000000'))).toEqual([{ type: 'codec', id: 0 }])
  })
})

describe('DeviceReader', () => {
  const CLIP = '00 00000005 68656c6c6f' // "hello"
  it('reads clipboard and ack messages, also split across chunks', () => {
    const all = hex(CLIP + '01 0000000000000007' + CLIP)
    const want = [{ type: 'clipboard', text: 'hello' }, { type: 'ack', seq: 7 }, { type: 'clipboard', text: 'hello' }]
    expect(new DeviceReader().feed(all)).toEqual(want)
    const r = new DeviceReader()
    expect([...all].flatMap((b) => r.feed(Uint8Array.of(b)))).toEqual(want)
  })
  it('skips uhid output', () => {
    expect(new DeviceReader().feed(hex('02 0001 0003 aabbcc' + CLIP))).toEqual([{ type: 'clipboard', text: 'hello' }])
  })
  it('keeps UTF-8', () => {
    const t = Buffer.from('é 😀')
    const b = new Uint8Array(5 + t.length)
    b.set([0, 0, 0, 0, t.length]); b.set(t, 5)
    expect(new DeviceReader().feed(b)).toEqual([{ type: 'clipboard', text: 'é 😀' }])
  })
})

describe('codecString', () => {
  it('reads profile/constraints/level from the SPS', () => {
    expect(codecString(hex('00000001 67 64 00 28 ac d9'))).toBe('avc1.640028')
    expect(codecString(hex('000001 67 42 c0 1f'))).toBe('avc1.42c01f')
  })
  it('throws without an SPS', () => {
    expect(() => codecString(hex('00000001 68 ce'))).toThrow()
  })
})

describe('enc', () => {
  it('keycode', () => {
    expect(toHex(enc.key(0, 4))).toBe('00' + '00' + '00000004' + '00000000' + '00000000')
  })
  it('touch down/up with the generic finger pointer', () => {
    const down = enc.touch(0, 10, 20, 1080, 2400)
    expect(down.length).toBe(32)
    expect(toHex(down)).toBe('02' + '00' + 'fffffffffffffffe' + '0000000a' + '00000014' + '0438' + '0960' + 'ffff' + '00000000' + '00000000')
    expect(toHex(enc.touch(1, 10, 20, 1080, 2400)).slice(44, 48)).toBe('0000')
  })
  it('scroll', () => {
    expect(toHex(enc.scroll(1, 2, 1080, 2400, 0, 1))).toBe('03' + '00000001' + '00000002' + '0438' + '0960' + '0000' + '0800' + '00000000')
    expect(toHex(enc.scroll(1, 2, 1080, 2400, 0, -16)).slice(30, 34)).toBe('8000')
  })
  it('text as UTF-8, max 300 bytes', () => {
    expect(toHex(enc.text('hé'))).toBe('01' + '00000003' + '68c3a9')
    expect(() => enc.text('a'.repeat(301))).toThrow()
    expect(() => enc.text('')).toThrow()
  })
  it('display power, start app, resize', () => {
    expect(toHex(enc.displayPower(false))).toBe('0a00')
    expect(toHex(enc.startApp('com.whatsapp'))).toBe('100c' + Buffer.from('com.whatsapp').toString('hex'))
    expect(toHex(enc.resize(1280, 960))).toBe('15' + '0500' + '03c0')
    expect(toHex(enc.resetVideo())).toBe('11')
    expect(toHex(enc.rotate())).toBe('0b')
  })
  it('set/get clipboard', () => {
    expect(toHex(enc.setClipboard(5, 'hi', true))).toBe('09' + '0000000000000005' + '01' + '00000002' + '6869')
    expect(toHex(enc.getClipboard(0))).toBe('0800')
    expect(() => enc.setClipboard(0, 'a'.repeat(262_131), false)).toThrow()
    expect(enc.setClipboard(0, 'a'.repeat(262_130), false).length).toBe(14 + 262_130)
    expect(() => enc.setClipboard(0, '', false)).toThrow()
  })
  it('rejects bad values before building bytes', () => {
    expect(() => enc.startApp('a;b')).toThrow()
    expect(() => enc.touch(0, Number.NaN, 0, 10, 10)).toThrow()
    expect(() => enc.touch(0, -1, 0, 10, 10)).toThrow()
    expect(() => enc.touch(0, 0, 0, 70000, 10)).toThrow()
    expect(() => enc.key(0, 1.5)).toThrow()
    expect(() => enc.resize(0, 10)).toThrow()
  })
})

describe('serverArgs', () => {
  const base: ServerOptions = { scid: '0a1b2c3d', video: true, audio: false, control: true, keepActive: true, powerOn: true, clipboard: false, display: null }

  it('mirror: main display, keep active, version first', () => {
    const a = serverArgs(base)
    expect(a[0]).toBe('5.0')
    expect(a).toEqual(expect.arrayContaining(['scid=0a1b2c3d', 'video=true', 'audio=false', 'control=true', 'tunnel_forward=true',
      'send_device_meta=false', 'video_codec=h264', 'audio_codec=raw', 'clipboard_autosync=false', 'keep_active=true', 'power_on=true']))
    expect(a.some((x) => x.startsWith('new_display'))).toBe(false)
  })

  it('app window, phone shape', () => {
    const a = serverArgs({ ...base, keepActive: false, powerOn: false,
      display: { size: null, dpi: null, flex: false, keepContent: true, decorations: false, ime: 'hide' } })
    expect(a).toEqual(expect.arrayContaining(['new_display=', 'vd_destroy_content=false', 'vd_system_decorations=false',
      'display_ime_policy=hide', 'power_on=false', 'keep_active=false', 'flex_display=false']))
  })

  it('app window, free shape', () => {
    const a = serverArgs({ ...base, display: { size: [900, 640], dpi: 160, flex: true, keepContent: false, decorations: true, ime: 'local' } })
    expect(a).toEqual(expect.arrayContaining(['new_display=900x640/160', 'flex_display=true', 'vd_destroy_content=true', 'vd_system_decorations=true']))
  })

  it('clipboard autosync on request', () => {
    expect(serverArgs({ ...base, video: false, clipboard: true })).toEqual(expect.arrayContaining(['clipboard_autosync=true', 'video=false']))
  })

  it('throws on a bad scid or size', () => {
    expect(() => serverArgs({ ...base, scid: 'xyz' })).toThrow()
    expect(() => serverArgs({ ...base, display: { size: [0, 5], dpi: null, flex: false, keepContent: false, decorations: true, ime: 'local' } })).toThrow()
  })
})
