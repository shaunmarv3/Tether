// Every renderer → main call goes through here: sender check + input validation (rule 6).
import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isPin } from '@tether/core'
import type { AppState } from '../shared/api'

export interface Handlers {
  getState(): AppState
  isLocked(): boolean
  setPin(pin: string): boolean
  unlock(pin: string): 'ok' | 'wrong' | 'wait'
  unlockHello(): Promise<boolean>
  installEngine(): Promise<void>
  openMirror(): void
}

export function registerIpc(win: BrowserWindow, h: Handlers): void {
  const rendererUrl = process.env.ELECTRON_RENDERER_URL ?? pathToFileURL(join(__dirname, '../renderer/index.html')).href

  const guard = (e: IpcMainInvokeEvent, needsUnlock: boolean) => {
    const url = e.senderFrame?.url ?? ''
    if (e.sender !== win.webContents || !url.startsWith(rendererUrl)) throw new Error('blocked: unknown sender')
    if (needsUnlock && h.isLocked()) throw new Error('blocked: app is locked')
  }

  ipcMain.handle('tether:getState', (e) => { guard(e, false); return h.getState() })
  ipcMain.handle('tether:setPin', (e, pin: unknown) => { guard(e, false); return isPin(pin) && h.setPin(pin) })
  ipcMain.handle('tether:unlock', (e, pin: unknown) => { guard(e, false); return isPin(pin) ? h.unlock(pin) : 'wrong' })
  ipcMain.handle('tether:unlockHello', (e) => { guard(e, false); return h.unlockHello() })
  ipcMain.handle('tether:installEngine', (e) => { guard(e, true); return h.installEngine() })
  ipcMain.handle('tether:openMirror', (e) => { guard(e, true); h.openMirror() })
}
