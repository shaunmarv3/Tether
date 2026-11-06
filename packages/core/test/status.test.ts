import { describe, expect, it, vi } from 'vitest'
import { run } from '../src/run'
import { getStatus, parseStatus, setKeepTrust } from '../src/status'

vi.mock('../src/run', () => ({ run: vi.fn() }))

const BATTERY = `Current Battery Service state:
  AC powered: false
  USB powered: true
  status: 2
  health: 2
  present: true
  level: 48
  scale: 100
  voltage: 4123`
// Real CMF Phone 1 / Android 16 output: /data reports itself mounted at /data/user/0.
const DF = `Filesystem       1K-blocks     Used Available Use% Mounted on
/dev/block/dm-64 113194976 89970132  22687976  80% /data/user/0`

const out = (blocks: string[]) => blocks.join('\n@@\n').replace(/\n/g, '\r\n') + '\r\n'

describe('parseStatus', () => {
  it('reads name, android, OEM OS, battery and storage (real CRLF output)', () => {
    expect(parseStatus(out(['CMF by Nothing Phone 1', 'A015', '16', '4.1', BATTERY, DF, '604800000', '0']))).toEqual({
      model: 'CMF by Nothing Phone 1', android: '16', nothingOs: '4.1', batteryPct: 48, storageUsedGb: 86, storageTotalGb: 108,
      adbTimeoutMs: 604800000, wirelessDebugging: false,
    })
  })

  it('falls back to ro.product.model when device_name is unset', () => {
    expect(parseStatus(out(['null', 'Pixel 9', '15', '', BATTERY, DF])).model).toBe('Pixel 9')
    expect(parseStatus(out(['', 'Pixel 9', '15', '', BATTERY, DF])).nothingOs).toBeNull()
  })

  it('nulls missing battery/df blocks', () => {
    expect(parseStatus(out(['', 'X1', '16', '', '', '']))).toEqual({
      model: 'X1', android: '16', nothingOs: null, batteryPct: null, storageUsedGb: null, storageTotalGb: null, adbTimeoutMs: null, wirelessDebugging: null,
    })
  })

  it('reads whether Wireless debugging is on', () => {
    expect(parseStatus(out(['', 'X1', '16', '', BATTERY, DF, '0', '1'])).wirelessDebugging).toBe(true)
    expect(parseStatus(out(['', 'X1', '16', '', BATTERY, DF, '0', 'null'])).wirelessDebugging).toBeNull()
  })

  // "Disable adb authorization timeout" ON writes 0; never touched = null = Android's default (7 days).
  it('reads the adb authorization timeout: 0 = never forgets this PC, null = the default', () => {
    expect(parseStatus(out(['', 'X1', '16', '', BATTERY, DF, '0'])).adbTimeoutMs).toBe(0)
    expect(parseStatus(out(['', 'X1', '16', '', BATTERY, DF, 'null'])).adbTimeoutMs).toBeNull()
  })
})

describe('getStatus', () => {
  it('rejects bad serial without calling adb', async () => {
    await expect(getStatus('adb', 'x;rm')).rejects.toThrow()
    expect(run).not.toHaveBeenCalled()
  })

  it('rejects when adb exits non-zero', async () => {
    vi.mocked(run).mockResolvedValue({ code: 1, stdout: '', stderr: "device 'X' not found" })
    await expect(getStatus('adb', 'X')).rejects.toThrow(/not found/)
  })
})

describe('setKeepTrust', () => {
  it('turns the 7-day forgetting off (0) or back to the Android default (delete)', async () => {
    vi.mocked(run).mockResolvedValue({ code: 0, stdout: '', stderr: '' })
    await setKeepTrust('adb', 'X', true)
    expect(run).toHaveBeenLastCalledWith('adb', ['-s', 'X', 'shell', 'settings put global adb_allowed_connection_time 0'])
    await setKeepTrust('adb', 'X', false)
    expect(run).toHaveBeenLastCalledWith('adb', ['-s', 'X', 'shell', 'settings delete global adb_allowed_connection_time'])
  })

  it('rejects a bad serial and a refused write', async () => {
    vi.mocked(run).mockClear()
    await expect(setKeepTrust('adb', 'x;rm', true)).rejects.toThrow()
    expect(run).not.toHaveBeenCalled()
    vi.mocked(run).mockResolvedValue({ code: 255, stdout: '', stderr: 'Permission denial' })
    await expect(setKeepTrust('adb', 'X', true)).rejects.toThrow(/Permission/)
  })
})
