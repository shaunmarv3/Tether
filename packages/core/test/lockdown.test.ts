import { describe, expect, it, vi } from 'vitest'
import { run } from '../src/run'
import { disableWirelessDebugging, lockdown } from '../src/lockdown'
import type { Sessions } from '../src/sessions'
import type { Device } from '../src/devices'

vi.mock('../src/run', () => ({ run: vi.fn() }))

const dev = (serial: string, state: Device['state'] = 'device'): Device => ({ serial, state, model: null, transport: 'usb' })

describe('lockdown', () => {
  it('closes windows, then turns off Wi-Fi debugging, then disconnects (in that order)', async () => {
    const calls: string[] = []
    const sessions = { closeAll: vi.fn(() => { calls.push('closeAll') }) } as unknown as Sessions
    vi.mocked(run).mockImplementation(async (_bin, args) => {
      calls.push(args.join(' '))
      return { code: 0, stdout: '', stderr: '' }
    })
    const r = await lockdown('adb', sessions, [dev('A'), dev('B', 'unauthorized')])
    expect(calls).toEqual([
      'closeAll',
      '-s A shell settings put global adb_wifi_enabled 0',
      'disconnect',
    ])
    expect(r.wifiOffFailed).toEqual([])
  })

  it('a failing settings put still disconnects and is reported', async () => {
    const sessions = { closeAll: vi.fn() } as unknown as Sessions
    vi.mocked(run).mockReset()
    vi.mocked(run)
      .mockResolvedValueOnce({ code: 1, stdout: '', stderr: 'error: device offline' })
      .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' })
    const r = await lockdown('adb', sessions, [dev('A')])
    expect(r.wifiOffFailed).toEqual(['A'])
    expect(vi.mocked(run).mock.calls[1][1]).toEqual(['disconnect'])
  })

  it('a thrown run (timeout) is also reported, disconnect still runs', async () => {
    const sessions = { closeAll: vi.fn() } as unknown as Sessions
    vi.mocked(run).mockReset()
    vi.mocked(run)
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' })
    expect((await lockdown('adb', sessions, [dev('A')])).wifiOffFailed).toEqual(['A'])
    expect(vi.mocked(run)).toHaveBeenCalledTimes(2)
  })
})

describe('disableWirelessDebugging', () => {
  it('sends the setting', async () => {
    vi.mocked(run).mockReset()
    vi.mocked(run).mockResolvedValue({ code: 0, stdout: '', stderr: '' })
    await disableWirelessDebugging('adb', 'A1')
    expect(run).toHaveBeenCalledWith('adb', ['-s', 'A1', 'shell', 'settings', 'put', 'global', 'adb_wifi_enabled', '0'])
  })

  it('rejects a bad serial without calling adb', async () => {
    vi.mocked(run).mockReset()
    await expect(disableWirelessDebugging('adb', 'a b')).rejects.toThrow()
    expect(run).not.toHaveBeenCalled()
  })
})
