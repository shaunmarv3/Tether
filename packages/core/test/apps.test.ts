import { describe, expect, it } from 'vitest'
import { isPackage, parseApps } from '../src/apps'

// Built from scrcpy 5.0 LogUtils.buildAppListMessage (name padded to 30 columns; a longer name puts the
// package on the next line after 33 spaces). Re-check against the real phone (M3 Task 7).
const OUT = [
  '[server] INFO: List of apps:',
  ' * Settings                       com.android.settings',
  ' * A Very Long System App Name Here',
  '                                  com.example.longname',
  ' - WhatsApp                       com.whatsapp',
  ' - Bad                            a;b',
].join('\r\n')

describe('parseApps', () => {
  it('reads system and user apps, sorted by name', () => {
    expect(parseApps(OUT)).toEqual([
      { name: 'A Very Long System App Name Here', pkg: 'com.example.longname', system: true },
      { name: 'Settings', pkg: 'com.android.settings', system: true },
      { name: 'WhatsApp', pkg: 'com.whatsapp', system: false },
    ])
  })
})

describe('isPackage', () => {
  it('accepts package names only', () => {
    expect(isPackage('com.whatsapp')).toBe(true)
    expect(isPackage('a;b')).toBe(false)
    expect(isPackage('')).toBe(false)
    expect(isPackage('a'.repeat(256))).toBe(false)
    expect(isPackage(42)).toBe(false)
  })
})
