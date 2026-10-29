import { mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { createLog, pruneLogs } from '../src/log'

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
})
