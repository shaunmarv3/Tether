import { describe, expect, it, vi } from 'vitest'
import { run } from '../src/run'
import { identify, pickPhone, type KnownPhone, type PhoneLink } from '../src/phones'

vi.mock('../src/run', () => ({ run: vi.fn() }))

const SN = 'R58M1234ABC'
const usb: PhoneLink = { serial: SN, state: 'device', model: 'A015', transport: 'usb', serialNo: SN, name: 'CMF Phone 1' }
const wifi: PhoneLink = { serial: `adb-${SN}-abc._adb-tls-connect._tcp`, state: 'device', model: 'A015', transport: 'wifi', serialNo: SN, name: 'CMF Phone 1' }
const known: KnownPhone[] = [{ serialNo: SN, name: 'CMF Phone 1', addedAt: '2026-10-30T00:00:00.000Z' }]
const other: PhoneLink = { serial: 'ZX1', state: 'device', model: 'Pixel', transport: 'usb', serialNo: 'ZX1', name: 'Pixel' }

describe('pickPhone', () => {
  it('same known phone on USB + Wi-Fi is one phone, USB preferred', () => {
    expect(pickPhone([wifi, usb], known)).toEqual({ current: usb, unknown: [], pending: null })
  })

  it('only the Wi-Fi link → current is Wi-Fi', () => {
    expect(pickPhone([wifi], known).current).toBe(wifi)
  })

  it('unknown phone is listed once, never current', () => {
    const otherWifi = { ...other, serial: '10.0.0.5:5555', transport: 'wifi' as const }
    expect(pickPhone([usb, other, otherWifi], known)).toEqual({ current: usb, unknown: [other], pending: null })
  })

  it('empty known list + one USB phone → unknown', () => {
    expect(pickPhone([usb], [])).toEqual({ current: null, unknown: [usb], pending: null })
  })

  it('unauthorized device is pending', () => {
    const u: PhoneLink = { serial: 'Q1', state: 'unauthorized', model: null, transport: 'usb', serialNo: null, name: null }
    expect(pickPhone([u], known)).toEqual({ current: null, unknown: [], pending: u })
  })

  it('serialNo not read yet → neither current nor unknown', () => {
    expect(pickPhone([{ ...usb, serialNo: null }], known)).toEqual({ current: null, unknown: [], pending: null })
  })
})

describe('identify', () => {
  it('reads ro.serialno and device_name in one call', async () => {
    vi.mocked(run).mockResolvedValue({ code: 0, stdout: `${SN}\r\nCMF Phone 1\r\n`, stderr: '' })
    await expect(identify('adb', SN)).resolves.toEqual({ serialNo: SN, name: 'CMF Phone 1' })
    expect(run).toHaveBeenCalledWith('adb', ['-s', SN, 'shell', 'getprop ro.serialno; settings get global device_name'])
  })

  it('falls back to the serial when device_name is null', async () => {
    vi.mocked(run).mockResolvedValue({ code: 0, stdout: `${SN}\nnull\n`, stderr: '' })
    await expect(identify('adb', SN)).resolves.toEqual({ serialNo: SN, name: SN })
  })

  it('rejects a bad serial without calling adb, and empty output', async () => {
    vi.mocked(run).mockClear()
    await expect(identify('adb', 'a;b')).rejects.toThrow()
    expect(run).not.toHaveBeenCalled()
    vi.mocked(run).mockResolvedValue({ code: 0, stdout: '\r\n', stderr: '' })
    await expect(identify('adb', SN)).rejects.toThrow()
  })
})
