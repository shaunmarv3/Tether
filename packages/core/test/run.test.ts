import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { run, runToFile } from '../src/run'

describe('runToFile', () => {
  it('writes binary stdout byte-exact', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'tether-')), 'out.bin')
    const r = await runToFile(process.execPath, ['-e', 'process.stdout.write(Buffer.from([0, 255, 10]))'], file)
    expect(r.code).toBe(0)
    expect([...readFileSync(file)]).toEqual([0, 255, 10])
  })
})

describe('run', () => {
  it('passes args literally, no shell', async () => {
    const r = await run(process.execPath, ['-e', 'console.log(process.argv[1])', 'a & echo pwned'])
    expect(r.code).toBe(0)
    expect(r.stdout).toBe('a & echo pwned\n')
  })

  it('returns non-zero code and stderr', async () => {
    const r = await run(process.execPath, ['-e', 'console.error("bad"); process.exit(3)'])
    expect(r.code).toBe(3)
    expect(r.stderr).toContain('bad')
  })

  it('rejects when binary missing', async () => {
    await expect(run('C:\nope\missing.exe', [])).rejects.toThrow()
  })

  it('rejects on timeout', async () => {
    const t0 = Date.now()
    await expect(run(process.execPath, ['-e', 'setTimeout(()=>{}, 5000)'], { timeoutMs: 200 })).rejects.toThrow(/timeout/)
    expect(Date.now() - t0).toBeLessThan(2000)
  })
})
