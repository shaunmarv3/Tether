// Every renderer → main call goes through here: sender check + input validation (rule 6).
import { ipcMain, type BrowserWindow, type IpcMainEvent, type IpcMainInvokeEvent, type WebContents } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isPackage, isPin, isSerial, type PhoneApp } from '@tether/core'
import type { Activity, AppOptions, AppState, IdleMinutes, InputEvent, ViewId } from '../shared/api'

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
  isViewSender(view: ViewId, sender: WebContents): boolean
  attach(view: ViewId, sender: WebContents): Promise<void>
  detach(view: ViewId): void
  input(view: ViewId, e: InputEvent): void
  listApps(): Promise<PhoneApp[]>
  openApp(pkg: string, name: string): void
  setAppOptions(pkg: string, opts: AppOptions): void
  pin(pkg: string, name: string): void
  unpin(pkg: string): void
  saveLayout(name: string, index: number | null): void
  launchLayout(index: number): void
  deleteLayout(index: number): void
}

const isIdle = (m: unknown): m is IdleMinutes => m === 0 || m === 5 || m === 10 || m === 30
const isSerialNo = (s: unknown): s is string => typeof s === 'string' && isSerial(s)
const isView = (v: unknown): v is ViewId => v === 'mirror' || (typeof v === 'string' && v.startsWith('app:') && isPackage(v.slice(4)))
const isName = (s: unknown): s is string => typeof s === 'string' && s.trim().length > 0 && s.length <= 100 && !/[\u0000-\u001f]/.test(s)
const isLayoutIndex = (i: unknown): i is number => Number.isInteger(i) && (i as number) >= 0 && (i as number) <= 8
const isBool = (b: unknown) => typeof b === 'boolean'
const isNum = (n: unknown, min: number, max: number) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max

function isAppOptions(o: unknown): o is AppOptions {
  const a = o as AppOptions
  return typeof o === 'object' && o !== null && ['phone', 'tablet', 'free'].includes(a.shape) &&
    isBool(a.keepRunning) && isBool(a.pcKeyboard) && isBool(a.hideStatusBar) && isBool(a.onTop)
}

// Shape and ranges only; exact byte limits are enforced again when the message is built (core `enc`).
function isInput(e: unknown): e is InputEvent {
  const i = e as Record<string, unknown>
  if (typeof e !== 'object' || e === null) return false
  const pos = () => isNum(i.w, 1, 65535) && isNum(i.h, 1, 65535) && isNum(i.x, 0, i.w as number) && isNum(i.y, 0, i.h as number)
  switch (i.t) {
    case 'touch': return (i.action === 0 || i.action === 1 || i.action === 2) && pos()
    case 'scroll': return pos() && isNum(i.hs, -16, 16) && isNum(i.vs, -16, 16)
    case 'key': return (i.action === 0 || i.action === 1) && Number.isInteger(i.keycode) && isNum(i.keycode, 0, 400)
    case 'text': return typeof i.text === 'string' && i.text.length > 0 && i.text.length <= 300
    case 'resize': return isNum(i.w, 2, 8192) && isNum(i.h, 2, 8192)
    case 'rotate': case 'reset': return true
    default: return false
  }
}

export function registerIpc(win: BrowserWindow, h: Handlers): void {
  const rendererUrl = process.env.ELECTRON_RENDERER_URL ?? pathToFileURL(join(__dirname, '../renderer/index.html')).href
  const fromTether = (e: IpcMainInvokeEvent | IpcMainEvent) => (e.senderFrame?.url ?? '').startsWith(rendererUrl)

  const guard = (e: IpcMainInvokeEvent, needsUnlock: boolean) => {
    if (e.sender !== win.webContents || !fromTether(e)) throw new Error('blocked: unknown sender')
    if (needsUnlock && h.isLocked()) throw new Error('blocked: app is locked')
  }
  // Phone views: the main window (mirror) or that app's own window.
  const viewGuard = (e: IpcMainInvokeEvent, view: unknown): ViewId => {
    if (!isView(view) || !fromTether(e) || !h.isViewSender(view, e.sender)) throw new Error('blocked: unknown sender')
    if (h.isLocked()) throw new Error('blocked: app is locked')
    return view
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

  ipcMain.handle('tether:attach', (e, view: unknown) => h.attach(viewGuard(e, view), e.sender))
  ipcMain.handle('tether:detach', (e, view: unknown) => {
    if (!isView(view) || !fromTether(e) || !h.isViewSender(view, e.sender)) throw new Error('blocked: unknown sender')
    h.detach(view) // allowed while locked: closing is always fine
  })
  ipcMain.on('tether:input', (e, view: unknown, input: unknown) => {
    if (!isView(view) || !fromTether(e) || !h.isViewSender(view, e.sender) || h.isLocked() || !isInput(input)) return
    h.input(view, input)
  })

  ipcMain.handle('tether:listApps', (e) => { guard(e, true); return h.listApps() })
  ipcMain.handle('tether:openApp', (e, pkg: unknown, name: unknown) => {
    guard(e, true); if (!isPackage(pkg) || !isName(name)) bad('app'); h.openApp(pkg as string, name as string)
  })
  ipcMain.handle('tether:setAppOptions', (e, pkg: unknown, opts: unknown) => {
    guard(e, true); if (!isPackage(pkg) || !isAppOptions(opts)) bad('options'); h.setAppOptions(pkg as string, opts as AppOptions)
  })
  ipcMain.handle('tether:pin', (e, pkg: unknown, name: unknown) => {
    guard(e, true); if (!isPackage(pkg) || !isName(name)) bad('app'); h.pin(pkg as string, name as string)
  })
  ipcMain.handle('tether:unpin', (e, pkg: unknown) => { guard(e, true); if (!isPackage(pkg)) bad('app'); h.unpin(pkg as string) })
  ipcMain.handle('tether:saveLayout', (e, name: unknown, index: unknown) => {
    guard(e, true); if (!isName(name) || (index !== null && !isLayoutIndex(index))) bad('layout'); h.saveLayout((name as string).trim(), index as number | null)
  })
  ipcMain.handle('tether:launchLayout', (e, i: unknown) => { guard(e, true); if (!isLayoutIndex(i)) bad('layout'); h.launchLayout(i as number) })
  ipcMain.handle('tether:deleteLayout', (e, i: unknown) => { guard(e, true); if (!isLayoutIndex(i)) bad('layout'); h.deleteLayout(i as number) })
}
