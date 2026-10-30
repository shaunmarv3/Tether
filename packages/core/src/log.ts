// Plain daily log files in %LOCALAPPDATA%\Tether\logs, kept 7 days (rule 10). Never log the PIN.
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

export function createLog(dir: string): (msg: string) => void {
  return (msg) => {
    const now = new Date()
    mkdirSync(dir, { recursive: true })
    appendFileSync(join(dir, `${now.toISOString().slice(0, 10)}.log`), `${now.toISOString()} ${msg}\n`)
  }
}

export function pruneLogs(dir: string, maxAgeDays = 7, now = Date.now()): void {
  if (!existsSync(dir)) return
  for (const name of readdirSync(dir)) {
    const file = join(dir, name)
    if (name.endsWith('.log') && now - statSync(file).mtimeMs > maxAgeDays * 86_400_000) rmSync(file)
  }
}

// Activity for the Security screen: lines written as log(`ACT ${text}`), newest first.
export function readActivity(dir: string, limit = 50): { time: string; text: string }[] {
  if (!existsSync(dir)) return []
  const lines = readdirSync(dir).filter((n) => n.endsWith('.log')).sort()
    .flatMap((n) => readFileSync(join(dir, n), 'utf8').split(/\r?\n/))
  const out: { time: string; text: string }[] = []
  for (const line of lines.reverse()) {
    const m = /^(\S+) ACT (.*)$/.exec(line)
    if (m) out.push({ time: m[1], text: m[2] })
    if (out.length >= limit) break
  }
  return out
}
