import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { ENGINE, findEngine, installEngine } from '../src/engine'
import { run } from '../src/run'

const dirs: string[] = []
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'tether-engine-')); dirs.push(d); return d }
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }) })
const tar = join(process.env.SystemRoot ?? 'C:\Windows', 'System32', 'tar.exe')
const fakeFetch = (body: Uint8Array | string) => (async () => new Response(body as BodyInit)) as unknown as typeof fetch

async function makeZip(): Promise<{ bytes: Uint8Array; sha256: string }> {
  const src = tmp()
  mkdirSync(join(src, ENGINE.folder))
  writeFileSync(join(src, ENGINE.folder, 'adb.exe'), '')
  writeFileSync(join(src, ENGINE.folder, 'scrcpy.exe'), '')
  const zip = join(src, 'e.zip')
  const r = await run(tar, ['-a', '-cf', zip, '-C', src, ENGINE.folder])
  expect(r.code).toBe(0)
  const bytes = readFileSync(zip)
  return { bytes, sha256: createHash('sha256').update(bytes).digest('hex') }
}

describe('findEngine', () => {
  it('returns null when nothing is there', () => {
    expect(findEngine(tmp())).toBeNull()
  })

  it('prefers overrideDir when it has adb.exe + scrcpy.exe', () => {
    const dir = tmp()
    writeFileSync(join(dir, 'adb.exe'), '')
    writeFileSync(join(dir, 'scrcpy.exe'), '')
    expect(findEngine(tmp(), dir)).toEqual({ adb: join(dir, 'adb.exe'), scrcpy: join(dir, 'scrcpy.exe') })
  })
})

describe('installEngine', () => {
  it('rejects a bad hash and leaves nothing behind', async () => {
    const root = tmp()
    await expect(installEngine(root, { fetch: fakeFetch('not a zip'), sha256: ENGINE.sha256 }))
      .rejects.toThrow('Download failed the safety check. Nothing was run.')
    expect(readdirSync(root).filter((f) => f.endsWith('.zip'))).toEqual([])
    expect(findEngine(root)).toBeNull()
  })

  it('unpacks a good zip', async () => {
    const root = tmp()
    const { bytes, sha256 } = await makeZip()
    let progressCalls = 0
    const paths = await installEngine(root, { fetch: fakeFetch(bytes), sha256, onProgress: () => { progressCalls++ } })
    expect(paths).toEqual({ adb: join(root, ENGINE.folder, 'adb.exe'), scrcpy: join(root, ENGINE.folder, 'scrcpy.exe') })
    expect(existsSync(paths.adb) && existsSync(paths.scrcpy)).toBe(true)
    expect(readdirSync(root).filter((f) => f.endsWith('.zip'))).toEqual([])
    expect(progressCalls).toBeGreaterThan(0)
  })

  it('retry after failure works', async () => {
    const root = tmp()
    const { bytes, sha256 } = await makeZip()
    await expect(installEngine(root, { fetch: fakeFetch('junk'), sha256 })).rejects.toThrow()
    await expect(installEngine(root, { fetch: fakeFetch(bytes), sha256 })).resolves.toBeTruthy()
  })
})
