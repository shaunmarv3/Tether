// Shape of everything main shares with the renderer. Types, plus the default app-window options.
import type { DeviceStatus, KnownPhone, PhoneApp, PhoneLink } from '@tether/core'

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

export type Shape = 'phone' | 'tablet' | 'free'
export interface AppOptions { shape: Shape; keepRunning: boolean; pcKeyboard: boolean; hideStatusBar: boolean; onTop: boolean }
export const DEFAULT_APP_OPTIONS: AppOptions = { shape: 'phone', keepRunning: false, pcKeyboard: true, hideStatusBar: false, onTop: false }
export interface Pin { pkg: string; name: string }
export interface Bounds { x: number; y: number; width: number; height: number }
export interface LayoutWindow { pkg: string; name: string; bounds: Bounds }
export interface Layout { name: string; windows: LayoutWindow[] }

export interface AppState {
  locked: boolean; hasPin: boolean; lockReason: string | null
  phoneLinked: boolean // shown on the Lock screen, so it is the only phone fact visible while locked
  engine: EngineState; engineProgress: string | null; enginePct: number | null; engineError: string | null
  // all null/empty while locked
  device: PhoneLink | null // the current known phone, or a pending (unauthorized/offline) one
  status: DeviceStatus | null
  unknown: PhoneLink[]; known: KnownPhone[]
  idleMinutes: IdleMinutes
  openViews: ViewId[]; pins: Pin[]; appOptions: Record<string, AppOptions>; layouts: Layout[]
}

export interface TetherApi {
  getState(): Promise<AppState>
  onState(cb: (s: AppState) => void): () => void
  setPin(pin: string): Promise<boolean>
  unlock(pin: string): Promise<'ok' | 'wrong' | 'wait'>
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
}
