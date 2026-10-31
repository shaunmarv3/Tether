// New phone screenshots, found by polling the screenshots folder with one constant command (rule 7).
import { isSerial } from './devices'
import { isDevicePath } from './files'
import { run } from './run'

export interface ShotFile { path: string; size: number }

// Pictures/Screenshots (Nothing, Pixel, Samsung…), else DCIM/Screenshots. Prints the newest file's path and size.
export const SHOT_CMD = 'cd /sdcard/Pictures/Screenshots 2>/dev/null || cd /sdcard/DCIM/Screenshots 2>/dev/null || exit 0; '
  + 'f=$(ls -t | head -n 1); [ -n "$f" ] && echo "$PWD/$f" && stat -c %s "$f"'

export function parseNewest(out: string): ShotFile | null {
  const [path = '', size = ''] = out.trim().split(/\r?\n/)
  return isDevicePath(path) && /^\d+$/.test(size) ? { path, size: Number(size) } : null
}

export async function newestScreenshot(adb: string, serial: string): Promise<ShotFile | null> {
  if (!isSerial(serial)) throw new Error(`bad serial: ${serial}`)
  const r = await run(adb, ['-s', serial, 'shell', SHOT_CMD])
  return r.code === 0 ? parseNewest(r.stdout) : null
}

// Decides when a file is a new screenshot to copy: not the one there at the start, and only once its size is steady.
export class ShotTracker {
  private started = false
  private baseline: string | null = null
  private pending: ShotFile | null = null
  private copied: string | null = null

  reset(): void {
    this.started = false
    this.pending = null
  }

  see(f: ShotFile | null): string | null {
    if (!this.started) {
      this.started = true
      this.baseline = f?.path ?? null
      return null
    }
    if (!f || f.path === this.baseline || f.path === this.copied) return null
    if (this.pending?.path === f.path && this.pending.size === f.size && f.size > 0) {
      this.copied = f.path
      this.pending = null
      return f.path
    }
    this.pending = f
    return null
  }
}
