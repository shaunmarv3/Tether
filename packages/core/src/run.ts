// The only place TETHER starts child processes. Always an argument array, never a shell (rule 7).
import { spawn, type ChildProcess } from 'node:child_process'
import { createWriteStream } from 'node:fs'

export interface RunResult { code: number; stdout: string; stderr: string }

export function run(bin: string, args: string[], opts: { env?: NodeJS.ProcessEnv; timeoutMs?: number } = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { shell: false, windowsHide: true, env: opts.env })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', (d: string) => { stdout += d })
    child.stderr.setEncoding('utf8').on('data', (d: string) => { stderr += d })
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`timeout: ${bin} ${args[0] ?? ''}`))
    }, opts.timeoutMs ?? 15_000)
    child.on('error', (err) => { clearTimeout(timer); reject(err) })
    child.on('close', (code) => { clearTimeout(timer); resolve({ code: code ?? -1, stdout, stderr }) })
  })
}

// Binary stdout straight into a file (e.g. screencap PNG).
export function runToFile(bin: string, args: string[], file: string, opts: { timeoutMs?: number } = {}): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { shell: false, windowsHide: true })
    const out = createWriteStream(file)
    let stderr = ''
    let code = -1
    let left = 2 // child closed + file flushed
    const done = () => { if (--left === 0) { clearTimeout(timer); resolve({ code, stderr }) } }
    child.stdout.pipe(out)
    child.stderr.setEncoding('utf8').on('data', (d: string) => { stderr += d })
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`timeout: ${bin} ${args[0] ?? ''}`))
    }, opts.timeoutMs ?? 30_000)
    out.on('finish', done)
    out.on('error', (err) => { clearTimeout(timer); child.kill(); reject(err) })
    child.on('error', (err) => { clearTimeout(timer); out.destroy(); reject(err) })
    child.on('close', (c) => { code = c ?? -1; done() })
  })
}

export function start(bin: string, args: string[], opts: { env?: NodeJS.ProcessEnv } = {}): ChildProcess {
  return spawn(bin, args, { shell: false, windowsHide: true, env: opts.env })
}
