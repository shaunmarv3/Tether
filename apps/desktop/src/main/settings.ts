// Everything TETHER stores lives in %LOCALAPPDATA%\Tether (rule 10).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { KnownPhone } from '@tether/core'
import { DEFAULT_CLIP_SETTINGS, type AppOptions, type ClipSettings, type IdleMinutes, type Layout, type Pin } from '../shared/api'

const root = join(process.env.LOCALAPPDATA ?? join(process.env.USERPROFILE ?? '.', 'AppData', 'Local'), 'Tether')

export const paths = {
  root,
  engine: join(root, 'engine'),
  logs: join(root, 'logs'),
  settings: join(root, 'settings.json'),
}

export interface Settings {
  pinHash?: string; knownPhones: KnownPhone[]; idleMinutes: IdleMinutes
  pins: Pin[]; apps: Record<string, AppOptions>; layouts: Layout[]; clip: ClipSettings
  passwordOff: boolean // the user's choice: TETHER opens without the password
  askSends: boolean // AI PILOT "Ask me before every send"
}

export function loadSettings(): Settings {
  const defaults: Settings = { knownPhones: [], idleMinutes: 10, pins: [], apps: {}, layouts: [], clip: DEFAULT_CLIP_SETTINGS, passwordOff: false, askSends: true }
  if (!existsSync(paths.settings)) return defaults
  try {
    const saved = JSON.parse(readFileSync(paths.settings, 'utf8')) as Partial<Settings>
    return { ...defaults, ...saved, clip: { ...DEFAULT_CLIP_SETTINGS, ...saved.clip } } // older files lack newer clip fields
  } catch {
    return defaults
  }
}

export function saveSettings(s: Settings): void {
  mkdirSync(paths.root, { recursive: true })
  writeFileSync(paths.settings, JSON.stringify(s, null, 2))
}
