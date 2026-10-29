import { describe, expect, it } from 'vitest'
import { run } from '../src/run'

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
