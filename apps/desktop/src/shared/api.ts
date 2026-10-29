// Shape of everything main shares with the renderer. Types only.
import type { Device, DeviceStatus } from '@tether/core'

export type EngineState = 'missing' | 'installing' | 'ready'

export interface AppState {
  locked: boolean; hasPin: boolean; helloAvailable: boolean
  engine: EngineState; engineProgress: string | null; enginePct: number | null; engineError: string | null
  device: Device | null; status: DeviceStatus | null // always null while locked
  mirrorOpen: boolean; mirrorError: string | null
}

export interface TetherApi {
  getState(): Promise<AppState>
  onState(cb: (s: AppState) => void): () => void
  setPin(pin: string): Promise<boolean>
  unlock(pin: string): Promise<'ok' | 'wrong' | 'wait'>
  unlockHello(): Promise<boolean>
  installEngine(): Promise<void>
  openMirror(): Promise<void>
}
