import { describe, expect, it } from 'vitest'
import { parseScrcpyForwards } from '../src/stream'

describe('parseScrcpyForwards', () => {
  it('finds only scrcpy forwards', () => {
    const out = 'R58M1234ABC tcp:63077 localabstract:scrcpy_66bce695\r\nemulator-5554 tcp:8080 tcp:8080\r\nR58M1234ABC tcp:55810 localabstract:scrcpy_588fa5cd\r\n'
    expect(parseScrcpyForwards(out)).toEqual([{ serial: 'R58M1234ABC', port: 63077 }, { serial: 'R58M1234ABC', port: 55810 }])
  })
})
