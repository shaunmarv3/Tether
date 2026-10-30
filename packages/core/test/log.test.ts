import { mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { createLog, pruneLogs, readActivity } from '../src/log'

const DAY = 86_400_000
const dirs: string[] = []
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'tether-log-')); dirs.push(d); return d }
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }) })

describe('logs', () => {
  it('createLog appends a line ending in the message', () => {
    const dir = join(tmp(), 'logs')
    createLog(dir)('hello world')
    const [file] = readdirSync(dir)
    expect(file).toMatch(/^\d{4}-\d{2}-\d{2}\.log$/)
    expect(readFileSync(join(dir, file), 'utf8')).toMatch(/hello world\n$/)
  })

  it('pruneLogs deletes .log files older than 7 days only', () => {
    const dir = tmp()
    const now = Date.now()
    for (const [name, age] of [['old.log', 8], ['new.log', 1], ['old.txt', 8]] as const) {
      writeFileSync(join(dir, name), 'x')
      const t = new Date(now - age * DAY)
      utimesSync(join(dir, name), t, t)
    }
    pruneLogs(dir, 7, now)
    expect(readdirSync(dir).sort()).toEqual(['new.log', 'old.txt'])
  })

  it('readActivity returns only ACT lines, newest first, across files, with limit', () => {
    const dir = tmp()
    writeFileSync(join(dir, '2026-10-29.log'),
      '2026-10-29T10:00:00.000Z ACT LOCKDOWN\n2026-10-29T10:01:00.000Z devices: none\n')
    writeFileSync(join(dir, '2026-10-30.log'),
      '2026-10-30T08:00:00.000Z ACT UNLOCKED · PIN\r\n2026-10-30T09:00:00.000Z ACT TRUSTED · CMF Phone 1\r\n')
    expect(readActivity(dir)).toEqual([
      { time: '2026-10-30T09:00:00.000Z', text: 'TRUSTED · CMF Phone 1' },
      { time: '2026-10-30T08:00:00.000Z', text: 'UNLOCKED · PIN' },
      { time: '2026-10-29T10:00:00.000Z', text: 'LOCKDOWN' },
    ])
    expect(readActivity(dir, 2)).toHaveLength(2)
    expect(readActivity(join(dir, 'missing'))).toEqual([])
  })
})
