// Everything TETHER stores lives in %LOCALAPPDATA%\Tether (rule 10).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(process.env.LOCALAPPDATA ?? join(process.env.USERPROFILE ?? '.', 'AppData', 'Local'), 'Tether')

export const paths = {
  root,
  engine: join(root, 'engine'),
  logs: join(root, 'logs'),
  settings: join(root, 'settings.json'),
}

export interface Settings { pinHash?: string }

export function loadSettings(): Settings {
  if (!existsSync(paths.settings)) return {}
  try {
    return JSON.parse(readFileSync(paths.settings, 'utf8')) as Settings
  } catch {
    return {}
  }
}

export function saveSettings(s: Settings): void {
  mkdirSync(paths.root, { recursive: true })
  writeFileSync(paths.settings, JSON.stringify(s, null, 2))
}
