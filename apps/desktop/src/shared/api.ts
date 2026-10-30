// Shape of everything main shares with the renderer. Types only.
import type { DeviceStatus, KnownPhone, PhoneLink } from '@tether/core'

export type EngineState = 'missing' | 'installing' | 'ready'
export type IdleMinutes = 0 | 5 | 10 | 30
export interface Activity { time: string; text: string }

export interface AppState {
  locked: boolean; hasPin: boolean; lockReason: string | null
  phoneLinked: boolean // shown on the Lock screen, so it is the only phone fact visible while locked
  engine: EngineState; engineProgress: string | null; enginePct: number | null; engineError: string | null
  // all null/empty while locked
  device: PhoneLink | null // the current known phone, or a pending (unauthorized/offline) one
  status: DeviceStatus | null
  unknown: PhoneLink[]; known: KnownPhone[]
  mirrorOpen: boolean; mirrorError: string | null
  idleMinutes: IdleMinutes
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
}
