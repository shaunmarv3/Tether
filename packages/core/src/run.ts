// The only place TETHER starts child processes. Always an argument array, never a shell (rule 7).
import { spawn, type ChildProcess } from 'node:child_process'

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

export function start(bin: string, args: string[], opts: { env?: NodeJS.ProcessEnv } = {}): ChildProcess {
  return spawn(bin, args, { shell: false, windowsHide: true, env: opts.env })
}
