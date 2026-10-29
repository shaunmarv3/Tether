import { describe, expect, it, vi } from 'vitest'
import { run } from '../src/run'
import { getStatus, parseStatus } from '../src/status'

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
    expect(parseStatus(out(['CMF by Nothing Phone 1', 'A015', '16', '4.1', BATTERY, DF]))).toEqual({
      model: 'CMF by Nothing Phone 1', android: '16', nothingOs: '4.1', batteryPct: 48, storageUsedGb: 86, storageTotalGb: 108,
    })
  })

  it('falls back to ro.product.model when device_name is unset', () => {
    expect(parseStatus(out(['null', 'Pixel 9', '15', '', BATTERY, DF])).model).toBe('Pixel 9')
    expect(parseStatus(out(['', 'Pixel 9', '15', '', BATTERY, DF])).nothingOs).toBeNull()
  })

  it('nulls missing battery/df blocks', () => {
    expect(parseStatus(out(['', 'X1', '16', '', '', '']))).toEqual({
      model: 'X1', android: '16', nothingOs: null, batteryPct: null, storageUsedGb: null, storageTotalGb: null,
    })
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
