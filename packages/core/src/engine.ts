// Gets the official scrcpy release (it ships adb) and checks it against a pinned SHA-256 (rule 8).
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { run } from './run'

export const ENGINE = {
  version: '5.0',
  url: 'https://github.com/Genymobile/scrcpy/releases/download/v5.0/scrcpy-win64-v5.0.zip',
  sha256: '44c10d9e82f20ea67227d14d37bf9fbe3603117c5736df3f514544a02ba20a73',
  folder: 'scrcpy-win64-v5.0',
} as const

export interface EnginePaths { adb: string; scrcpy: string }

function inDir(dir: string): EnginePaths | null {
  const p = { adb: join(dir, 'adb.exe'), scrcpy: join(dir, 'scrcpy.exe') }
  return existsSync(p.adb) && existsSync(p.scrcpy) ? p : null
}

export function findEngine(engineRoot: string, overrideDir?: string | undefined): EnginePaths | null {
  return (overrideDir ? inDir(overrideDir) : null) ?? inDir(join(engineRoot, ENGINE.folder))
}

export async function installEngine(engineRoot: string, opts: {
  url?: string; sha256?: string; fetch?: typeof fetch
  onProgress?: (receivedBytes: number, totalBytes: number | null) => void
} = {}): Promise<EnginePaths> {
  const offline = "Couldn't download. Check your internet and try again."
  mkdirSync(engineRoot, { recursive: true })

  const chunks: Uint8Array[] = []
  try {
    const res = await (opts.fetch ?? fetch)(opts.url ?? ENGINE.url)
    if (!res.ok || !res.body) throw new Error(offline)
    const total = Number(res.headers.get('content-length')) || null
    let received = 0
    for await (const chunk of res.body) {
      chunks.push(chunk)
      received += chunk.length
      opts.onProgress?.(received, total)
    }
  } catch {
    throw new Error(offline)
  }

  const bytes = Buffer.concat(chunks)
  const hash = createHash('sha256').update(bytes).digest('hex')
  if (hash !== (opts.sha256 ?? ENGINE.sha256)) throw new Error('Download failed the safety check. Nothing was run.')

  const zip = join(engineRoot, 'download.zip')
  try {
    writeFileSync(zip, bytes)
    // Absolute path so Git's tar is never picked. bsdtar refuses ".." and absolute entries by default.
    const tar = join(process.env.SystemRoot ?? 'C:\Windows', 'System32', 'tar.exe')
    const r = await run(tar, ['-xf', zip, '-C', engineRoot], { timeoutMs: 60_000 })
    if (r.code !== 0) throw new Error(`Couldn't unpack the engine: ${r.stderr.trim()}`)
  } finally {
    rmSync(zip, { force: true })
  }
  const paths = findEngine(engineRoot)
  if (!paths) throw new Error("Couldn't unpack the engine: adb.exe or scrcpy.exe missing.")
  return paths
}
