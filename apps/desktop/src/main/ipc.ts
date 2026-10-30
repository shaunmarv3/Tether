// Every renderer → main call goes through here: sender check + input validation (rule 6).
import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isPin, isSerial } from '@tether/core'
import type { Activity, AppState, IdleMinutes } from '../shared/api'

export interface Handlers {
  getState(): AppState
  isLocked(): boolean
  setPin(pin: string): boolean
  unlock(pin: string): 'ok' | 'wrong' | 'wait'
  installEngine(): Promise<void>
  openMirror(): void
  trust(serialNo: string): void
  forget(serialNo: string): void
  lockdown(): Promise<void>
  setIdle(minutes: IdleMinutes): void
  getActivity(): Activity[]
}

const isIdle = (m: unknown): m is IdleMinutes => m === 0 || m === 5 || m === 10 || m === 30
const isSerialNo = (s: unknown): s is string => typeof s === 'string' && isSerial(s)

export function registerIpc(win: BrowserWindow, h: Handlers): void {
  const rendererUrl = process.env.ELECTRON_RENDERER_URL ?? pathToFileURL(join(__dirname, '../renderer/index.html')).href

  const guard = (e: IpcMainInvokeEvent, needsUnlock: boolean) => {
    const url = e.senderFrame?.url ?? ''
    if (e.sender !== win.webContents || !url.startsWith(rendererUrl)) throw new Error('blocked: unknown sender')
    if (needsUnlock && h.isLocked()) throw new Error('blocked: app is locked')
  }
  const bad = (what: string) => { throw new Error(`blocked: bad ${what}`) }

  ipcMain.handle('tether:getState', (e) => { guard(e, false); return h.getState() })
  ipcMain.handle('tether:setPin', (e, pin: unknown) => { guard(e, false); return isPin(pin) && h.setPin(pin) })
  ipcMain.handle('tether:unlock', (e, pin: unknown) => { guard(e, false); return isPin(pin) ? h.unlock(pin) : 'wrong' })
  ipcMain.handle('tether:installEngine', (e) => { guard(e, true); return h.installEngine() })
  ipcMain.handle('tether:openMirror', (e) => { guard(e, true); h.openMirror() })
  ipcMain.handle('tether:trust', (e, sn: unknown) => { guard(e, true); if (!isSerialNo(sn)) bad('serial'); h.trust(sn as string) })
  ipcMain.handle('tether:forget', (e, sn: unknown) => { guard(e, true); if (!isSerialNo(sn)) bad('serial'); h.forget(sn as string) })
  ipcMain.handle('tether:lockdown', (e) => { guard(e, true); return h.lockdown() })
  ipcMain.handle('tether:setIdle', (e, m: unknown) => { guard(e, true); if (!isIdle(m)) bad('minutes'); h.setIdle(m as IdleMinutes) })
  ipcMain.handle('tether:getActivity', (e) => { guard(e, true); return h.getActivity() })
}
