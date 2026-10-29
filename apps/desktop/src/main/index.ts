import { app, BrowserWindow, Menu, Tray } from 'electron'
import { join } from 'node:path'
import {
  createLog, DeviceTracker, findEngine, getStatus, hashPin, installEngine, PinGate, pruneLogs, Sessions,
  type Device, type EnginePaths,
} from '@tether/core'
import type { AppState } from '../shared/api'
import { registerIpc } from './ipc'
import { loadSettings, paths, saveSettings } from './settings'
import { trayIcon } from './trayIcon'

const log = createLog(paths.logs)
const settings = loadSettings()
const sessions = new Sessions()
let gate = settings.pinHash ? new PinGate(settings.pinHash) : null
let engine: EnginePaths | null = null
let tracker: DeviceTracker | null = null
let statusTimer: NodeJS.Timeout | null = null
let win: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false

const state: AppState = {
  locked: true, hasPin: !!settings.pinHash, helloAvailable: false, // locked until a PIN is set or entered
  engine: 'missing', engineProgress: null, enginePct: null, engineError: null,
  device: null, status: null, mirrorOpen: false, mirrorError: null,
}

// The renderer never sees phone data while locked.
const publicState = (): AppState => (state.locked ? { ...state, device: null, status: null } : { ...state })
const readyDevice = (): Device | null => (state.device?.state === 'device' ? state.device : null)

function push(): void {
  win?.webContents.send('tether:state', publicState())
  updateTray()
}

function updateTray(): void {
  if (!tray) return
  const phone = readyDevice()
  tray.setImage(trayIcon(!!phone))
  tray.setToolTip(phone ? `TETHER · ${state.locked ? 'PHONE CONNECTED' : `${state.status?.model ?? phone.model ?? 'PHONE'} · USB`}` : 'TETHER · NO PHONE')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open TETHER', click: showWindow },
    { label: 'Mirror', enabled: !!phone && !state.locked, click: openMirror },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit() } },
  ]))
}

async function refreshStatus(): Promise<void> {
  const phone = readyDevice()
  if (!engine || !phone || state.locked) return
  try {
    const status = await getStatus(engine.adb, phone.serial)
    if (readyDevice()?.serial === phone.serial) state.status = status
  } catch (err) {
    state.status = null // cable pulled mid-call etc.; the tracker will catch up
    log(`status failed: ${(err as Error).message}`)
  }
  push()
}

function startTracking(paths: EnginePaths): void {
  engine = paths
  tracker = new DeviceTracker(paths.adb)
  tracker.on('change', (devices: Device[]) => {
    const next = devices.find((d) => d.state === 'device') ?? devices[0] ?? null
    if (next?.serial !== state.device?.serial || next?.state !== state.device?.state) state.status = null
    state.device = next
    state.mirrorOpen = !!next && sessions.isOpen(next.serial)
    log(`devices: ${devices.map((d) => `${d.serial}=${d.state}`).join(', ') || 'none'}`)
    push()
    void refreshStatus()
  })
  tracker.start()
  statusTimer = setInterval(() => void refreshStatus(), 10_000)
}

function openMirror(): void {
  const phone = readyDevice()
  if (!engine || !phone || state.locked) return
  log(`mirror open ${phone.serial}`)
  sessions.openMirror(engine, phone.serial, state.status?.model ?? phone.model ?? 'Phone')
}

sessions.on('change', () => {
  state.mirrorOpen = !!state.device && sessions.isOpen(state.device.serial)
  state.mirrorError = sessions.lastError
  if (sessions.lastError) log(`mirror error: ${sessions.lastError}`)
  push()
})

async function doInstallEngine(): Promise<void> {
  if (state.engine !== 'missing') return
  Object.assign(state, { engine: 'installing', engineError: null, engineProgress: 'DOWNLOADING' })
  push()
  try {
    const p = await installEngine(paths.engine, {
      onProgress: (got, total) => {
        const mb = (n: number) => (n / 1e6).toFixed(1)
        state.engineProgress = got === total ? 'CHECKING · UNPACKING' : `DOWNLOADING ${mb(got)}${total ? ` / ${mb(total)}` : ''} MB`
        state.enginePct = total ? Math.round((got / total) * 100) : null
        push()
      },
    })
    Object.assign(state, { engine: 'ready', engineProgress: null, enginePct: null })
    log('engine installed')
    startTracking(p)
  } catch (err) {
    Object.assign(state, { engine: 'missing', engineProgress: null, enginePct: null, engineError: (err as Error).message })
    log(`engine install failed: ${(err as Error).message}`)
  }
  push()
}

function createWindow(): BrowserWindow {
  const w = new BrowserWindow({
    width: 1180, height: 760, show: false, backgroundColor: '#0F0E0D', title: 'TETHER', autoHideMenuBar: true,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  w.webContents.on('will-navigate', (e) => e.preventDefault())
  w.on('close', (e) => { if (!quitting) { e.preventDefault(); w.hide() } })
  w.once('ready-to-show', () => w.show())
  if (process.env.ELECTRON_RENDERER_URL) void w.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void w.loadFile(join(__dirname, '../renderer/index.html'))
  return w
}

function showWindow(): void {
  win?.show()
  win?.focus()
}

app.enableSandbox()
if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', showWindow)
  app.on('window-all-closed', () => { /* tray app: keep running */ })
  app.on('before-quit', () => {
    quitting = true
    sessions.closeAll()
    tracker?.stop()
    if (statusTimer) clearInterval(statusTimer)
  })
  void app.whenReady().then(() => {
    pruneLogs(paths.logs)
    log('start')
    win = createWindow()
    tray = new Tray(trayIcon(false))
    tray.on('click', showWindow)
    registerIpc(win, {
      getState: publicState,
      isLocked: () => state.locked,
      setPin: (pin) => {
        if (settings.pinHash) return false
        settings.pinHash = hashPin(pin)
        saveSettings(settings)
        gate = new PinGate(settings.pinHash)
        Object.assign(state, { hasPin: true, locked: false })
        log('pin set')
        push()
        void refreshStatus()
        return true
      },
      unlock: (pin) => {
        const result = gate ? gate.tryUnlock(pin) : 'wrong'
        log(`unlock: ${result}`)
        if (result === 'ok') {
          state.locked = false
          push()
          void refreshStatus()
        }
        return result
      },
      unlockHello: async () => false,
      installEngine: doInstallEngine,
      openMirror,
    })
    const found = findEngine(paths.engine, process.env.TETHER_ENGINE_DIR)
    if (found) {
      state.engine = 'ready'
      startTracking(found)
    }
    push()
  })
}
