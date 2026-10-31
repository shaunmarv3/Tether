// Shape of everything main shares with the renderer. Types, plus the default app-window options.
import type { DeviceStatus, KnownPhone, PhoneApp, PhoneLink, PhoneNotification, RemoteEntry } from '@tether/core'

export type EngineState = 'missing' | 'installing' | 'ready'
export type IdleMinutes = 0 | 5 | 10 | 30
export interface Activity { time: string; text: string }

// A view = one live phone screen: the Mirror page, or one app window.
export type ViewId = 'mirror' | `app:${string}`
export type VideoMsg =
  | { kind: 'session'; width: number; height: number }
  | { kind: 'config'; codec: string; data: Uint8Array }
  | { kind: 'frame'; key: boolean; pts: number; data: Uint8Array }
  | { kind: 'closed'; error: string | null }
export type InputEvent =
  | { t: 'touch'; action: 0 | 1 | 2; x: number; y: number; w: number; h: number }
  | { t: 'scroll'; x: number; y: number; w: number; h: number; hs: number; vs: number }
  | { t: 'key'; action: 0 | 1; keycode: number }
  | { t: 'text'; text: string }
  | { t: 'resize'; w: number; h: number }
  | { t: 'rotate' } | { t: 'reset' } // reset = ask for a fresh key frame after a decoder error
  | { t: 'paste' } // Ctrl+V: put the PC clipboard into the focused phone field

export type Shape = 'phone' | 'tablet' | 'free'
export interface AppOptions { shape: Shape; keepRunning: boolean; pcKeyboard: boolean; hideStatusBar: boolean; onTop: boolean }
export const DEFAULT_APP_OPTIONS: AppOptions = { shape: 'phone', keepRunning: false, pcKeyboard: true, hideStatusBar: false, onTop: false }
export interface Pin { pkg: string; name: string }
export interface Bounds { x: number; y: number; width: number; height: number }
export interface LayoutWindow { pkg: string; name: string; bounds: Bounds }
export interface Layout { name: string; windows: LayoutWindow[] }

// Clipboard. A secret clip (one-time code) never reaches the renderer: text is null.
export interface Clip { id: number; dir: 'phone' | 'pc'; text: string | null; secret: boolean; size: number; at: string; wipeAt: string | null; note: string | null }
export type WipeSeconds = 30 | 60 | 120
export interface ClipSettings { sync: boolean; hideCodes: boolean; keepOutOfHistory: boolean; wipeSeconds: WipeSeconds; screenshots: boolean } // screenshots: phone screenshots → PC clipboard
export const DEFAULT_CLIP_SETTINGS: ClipSettings = { sync: true, hideCodes: true, keepOutOfHistory: true, wipeSeconds: 60, screenshots: true }
export type ClipLinkState = 'off' | 'starting' | 'on' | 'error'
export interface FileOp { busy: boolean; text: string | null; error: boolean } // LCD line on the Files screen
export interface Place { name: string; dir: string; count: number | null }
export interface NotificationItem extends PhoneNotification { app: string } // app: the phone's name for pkg

// AI pilot (Phase 3). Claude Code drives the phone through tether-mcp; main's guard decides, the user answers questions.
export interface PilotStep { at: string; text: string; verdict: 'ok' | 'asked' | 'blocked' }
export interface PilotTaskView {
  goal: string; steps: string[]; apps: string[] /* names */; to: string | null
  status: 'waiting' | 'running' | 'denied' | 'stopped' | 'done'; why: string | null // why it stopped
  log: PilotStep[] /* newest first, max 100 */; summary: string | null; startedAt: string
}
export interface PilotQuestion {
  id: number; kind: 'plan' | 'send' | 'risky' | 'unlock'; app: string; why: string // why SEND / REACT for a send
  to: string | null; message: string | null // send (REACT: the emoji)
  task: { goal: string; steps: string[]; apps: string[]; to: string | null } | null // plan
}
export interface PilotView {
  connected: boolean | null; command: string; current: PilotTaskView | null; past: PilotTaskView[]; question: PilotQuestion | null
  askSends: boolean // "Ask me before every send" (not saved, ON after lock/restart)
}
export const LOCKED_PILOT: PilotView = { connected: null, command: '', current: null, past: [], question: null, askSends: true }

export interface AppState {
  locked: boolean; hasPin: boolean; lockReason: string | null
  weakPassword: boolean // unlocked with an old short PIN: ask for an 8+ character password
  phoneLinked: boolean // shown on the Lock screen, so it is the only phone fact visible while locked
  engine: EngineState; engineProgress: string | null; enginePct: number | null; engineError: string | null
  // all null/empty while locked
  device: PhoneLink | null // the current known phone, or a pending (unauthorized/offline) one
  status: DeviceStatus | null
  unknown: PhoneLink[]; known: KnownPhone[]
  idleMinutes: IdleMinutes
  openViews: ViewId[]; pins: Pin[]; appOptions: Record<string, AppOptions>; layouts: Layout[]
  clips: Clip[]; clipStats: { synced: number; wiped: number }; clipSettings: ClipSettings; clipLink: ClipLinkState
  fileOp: FileOp
  pilot: PilotView
}

export interface TetherApi {
  getState(): Promise<AppState>
  onState(cb: (s: AppState) => void): () => void
  setPin(pin: string): Promise<boolean>
  unlock(pin: string): Promise<'ok' | 'wrong' | 'wait'>
  changePassword(current: string, next: string): Promise<'ok' | 'wrong' | 'wait'>
  installEngine(): Promise<void>
  openMirror(): Promise<void>
  trust(serialNo: string): Promise<void>
  forget(serialNo: string): Promise<void>
  lockdown(): Promise<void>
  setIdle(minutes: IdleMinutes): Promise<void>
  getActivity(): Promise<Activity[]>
  // phone views
  attach(view: ViewId): Promise<void>
  detach(view: ViewId): Promise<void>
  onVideo(cb: (view: ViewId, m: VideoMsg) => void): () => void
  onAudio(cb: (pcm: Uint8Array) => void): () => void
  input(view: ViewId, e: InputEvent): void
  onGo(cb: (page: 'home' | 'mirror') => void): () => void
  // apps + layouts
  listApps(): Promise<PhoneApp[]>
  openApp(pkg: string, name: string): Promise<void>
  setAppOptions(pkg: string, opts: AppOptions): Promise<void>
  pin(pkg: string, name: string): Promise<void>
  unpin(pkg: string): Promise<void>
  saveLayout(name: string, index: number | null): Promise<void>
  launchLayout(index: number): Promise<void>
  deleteLayout(index: number): Promise<void>
  // files
  listDir(dir: string): Promise<RemoteEntry[]>
  countPlaces(): Promise<Place[]>
  sendFiles(paths: string[], dir: string): Promise<void>
  previewFile(path: string): Promise<void> // opens in a small TETHER window, or the file's Windows app
  previewStep(delta: 1 | -1): Promise<void> // preview window only: next/previous media in that folder
  pickAndSend(dir: string): Promise<void>
  saveToPc(paths: string[]): Promise<void>
  deleteFiles(paths: string[]): Promise<void>
  newFolder(path: string): Promise<void>
  installApk(path: string): Promise<void>
  openSaveFolder(): Promise<void>
  pathForFile(f: File): string
  // notifications (the phone's shade)
  listNotifications(): Promise<NotificationItem[]>
  clearNotification(key: string): Promise<void>
  // clipboard + quick keys
  copyClip(id: number): Promise<void>
  sendClip(id: number): Promise<void>
  pasteToPhone(): Promise<void>
  clearClips(): Promise<void>
  setClipSettings(s: ClipSettings): Promise<void>
  screenshot(): Promise<void>
  screenOff(): Promise<void>
  saveRecording(data: ArrayBuffer): Promise<void>
  // AI pilot
  pilotAnswer(id: number, yes: boolean, text?: string): Promise<void> // text: the SEND popup's edited message
  pilotAskSends(on: boolean): Promise<void>
  pilotStop(): Promise<void>
  pilotConnect(): Promise<void>
  pilotDisconnect(): Promise<void>
}
