import { afterEach, describe, expect, it, vi } from 'vitest'
import { DeviceTracker, isSerial, parseDevices, type Device } from '../src/devices'

const OUT = `* daemon not running; starting now at tcp:5037
* daemon started successfully
List of devices attached
A1B2C3D4E5         device usb:1-1 product:Tetris model:CMF_Phone_1 device:Tetris transport_id:1
ZZ99               unauthorized usb:1-2 transport_id:2
adb-A1B2C3D4E5-xYz._adb-tls-connect._tcp device product:Tetris model:CMF_Phone_1 device:Tetris transport_id:3
192.168.1.42:5555  offline transport_id:4

`

describe('parseDevices', () => {
  it('parses every state and ignores daemon chatter', () => {
    expect(parseDevices(OUT)).toEqual([
      { serial: 'A1B2C3D4E5', state: 'device', model: 'CMF Phone 1', transport: 'usb' },
      { serial: 'ZZ99', state: 'unauthorized', model: null, transport: 'usb' },
      { serial: 'adb-A1B2C3D4E5-xYz._adb-tls-connect._tcp', state: 'device', model: 'CMF Phone 1', transport: 'wifi' },
      { serial: '192.168.1.42:5555', state: 'offline', model: null, transport: 'wifi' },
    ])
  })

  it('returns [] for an empty list', () => {
    expect(parseDevices('List of devices attached\r\n\r\n')).toEqual([])
  })
})

describe('isSerial', () => {
  it('rejects shell characters and empty', () => {
    for (const s of ['a b', 'x;rm', '']) expect(isSerial(s)).toBe(false)
  })
  it('accepts real serials', () => {
    for (const d of parseDevices(OUT)) expect(isSerial(d.serial)).toBe(true)
  })
})

describe('DeviceTracker', () => {
  afterEach(() => { vi.useRealTimers() })
  const dev = (serial: string): Device => ({ serial, state: 'device', model: null, transport: 'usb' })

  it('emits only on change', async () => {
    vi.useFakeTimers()
    const results = [[dev('A')], [dev('A')], [dev('B')]]
    const list = vi.fn(async () => results.shift() ?? [dev('B')])
    const t = new DeviceTracker('adb', list)
    const seen: Device[][] = []
    t.on('change', (d: Device[]) => seen.push(d))
    t.start(1000)
    await vi.advanceTimersByTimeAsync(3500)
    t.stop()
    expect(seen).toEqual([[dev('A')], [dev('B')]])
  })

  it('emits [] once when adb fails', async () => {
    vi.useFakeTimers()
    let ok = true
    const list = vi.fn(async () => { if (ok) return [dev('A')]; throw new Error('adb died') })
    const t = new DeviceTracker('adb', list)
    const seen: Device[][] = []
    t.on('change', (d: Device[]) => seen.push(d))
    t.start(1000)
    await vi.advanceTimersByTimeAsync(10)
    ok = false
    await vi.advanceTimersByTimeAsync(3500)
    t.stop()
    expect(seen).toEqual([[dev('A')], []])
  })
})
