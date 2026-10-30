import { app, BrowserWindow, globalShortcut, Menu, Notification, powerMonitor, screen, Tray } from 'electron'
import { join } from 'node:path'
import {
  createLog, DeviceTracker, findEngine, getStatus, hashPin, identify, installEngine, listApps, lockdown, pickPhone, PinGate,
  pruneLogs, readActivity, removeStaleForwards, type Device, type EnginePaths, type PhoneApp, type PhoneLink,
} from '@tether/core'
import { DEFAULT_APP_OPTIONS, type AppOptions, type AppState, type Bounds } from '../shared/api'
import { registerIpc } from './ipc'
import { loadSettings, paths, saveSettings } from './settings'
import { trayIcon } from './trayIcon'
import { TITLE_BAR, Views } from './views'

const log = createLog(paths.logs)
const act = (text: string) => log(`ACT ${text}`) // shown on the Security screen
const settings = loadSettings()
let gate = settings.pinHash ? new PinGate(settings.pinHash) : null
let engine: EnginePaths | null = null
let tracker: DeviceTracker | null = null
let timers: NodeJS.Timeout[] = []
let win: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false

let devices: Device[] = []
const ids = new Map<string, { serialNo: string; name: string }>() // by adb serial, while plugged in
const reading = new Set<string>()
const warned = new Set<string>() // unknown serialNos already announced
let lastCurrent: string | null = null
const appsCache = new Map<string, PhoneApp[]>() // by adb serial

const state: AppState = {
  locked: true, hasPin: !!settings.pinHash, lockReason: null, phoneLinked: false, // locked until a PIN is set or entered
  engine: 'missing', engineProgress: null, enginePct: null, engineError: null,
  device: null, status: null, unknown: [], known: settings.knownPhones, idleMinutes: settings.idleMinutes,
  openViews: [], pins: settings.pins, appOptions: settings.apps, layouts: settings.layouts,
}

// The renderer never sees phone data while locked.
const publicState = (): AppState => state.locked
  ? { ...state, device: null, status: null, unknown: [], known: [], openViews: [], pins: [], appOptions: {}, layouts: [] }
  : { ...state }
const readyDevice = (): PhoneLink | null => (state.device?.state === 'device' ? state.device : null)
const linkLabel = (d: PhoneLink) => (d.transport === 'usb' ? 'USB' : 'WI-FI')
const appOptions = (pkg: string): AppOptions => settings.apps[pkg] ?? DEFAULT_APP_OPTIONS
const rendererQuery = (query: Record<string, string>) => new URLSearchParams(query).toString()

function loadRenderer(w: BrowserWindow, query: Record<string, string> = {}): void {
  if (process.env.ELECTRON_RENDERER_URL) {
    const q = rendererQuery(query)
    void w.loadURL(`${process.env.ELECTRON_RENDERER_URL}${q ? `?${q}` : ''}`)
  } else void w.loadFile(join(__dirname, '../renderer/index.html'), { query })
}

function harden(w: BrowserWindow): void {
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  w.webContents.on('will-navigate', (e) => e.preventDefault())
}

const webPreferences = () => ({ preload: join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: true })

const views = new Views({
  engine: () => engine,
  phone: () => {
    const d = readyDevice()
    return d && !state.locked ? { serial: d.serial, android: Number.parseInt(state.status?.android ?? '0', 10) || 0 } : null
  },
  mainWindow: () => win,
  appOptions,
  makeAppWindow: (pkg, name, opts, bounds) => {
    const size = opts.shape === 'tablet' ? [960, 600] : opts.shape === 'free' ? [900, 640] : [400, 860]
    const w = new BrowserWindow({
      ...(bounds ?? { width: size[0], height: size[1] + TITLE_BAR }), useContentSize: !bounds,
      show: false, backgroundColor: '#0F0E0D', title: name, alwaysOnTop: opts.onTop, autoHideMenuBar: true,
      titleBarStyle: 'hidden', titleBarOverlay: { color: '#161513', symbolColor: '#EFECE6', height: TITLE_BAR },
      webPreferences: webPreferences(),
    })
    harden(w)
    w.once('ready-to-show', () => w.show())
    loadRenderer(w, { app: pkg, name, shape: opts.shape })
    return w
  },
  onChange: () => {
    state.openViews = views.openViews()
    push()
  },
  log,
})

function push(): void {
  win?.webContents.send('tether:state', publicState())
  updateTray()
}

function updateTray(): void {
  if (!tray) return
  const phone = readyDevice()
  tray.setImage(trayIcon(!!phone))
  tray.setToolTip(phone
    ? `TETHER · ${state.locked ? 'PHONE CONNECTED' : `${state.status?.model ?? phone.name ?? 'PHONE'} · ${linkLabel(phone)}`}`
    : 'TETHER · NO PHONE')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open TETHER', click: showWindow },
    { label: 'Mirror', enabled: !!phone && !state.locked, click: openMirror },
    { label: 'Lockdown', click: () => void doLockdown() },
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

// Links → current / unknown / pending phone (rule 3: only known phones can be shown).
function recompute(): void {
  const links: PhoneLink[] = devices.map((d) => ({ ...d, serialNo: ids.get(d.serial)?.serialNo ?? null, name: ids.get(d.serial)?.name ?? null }))
  const { current, unknown, pending } = pickPhone(links, settings.knownPhones)
  const next = current ?? pending
  if (next?.serial !== state.device?.serial || next?.state !== state.device?.state) state.status = null
  if (current && current.serial !== lastCurrent) act(`CONNECTED · ${linkLabel(current)}`)
  lastCurrent = current?.serial ?? null
  for (const u of unknown) {
    if (warned.has(u.serialNo!)) continue
    warned.add(u.serialNo!)
    new Notification({ title: 'TETHER', body: 'UNKNOWN DEVICE CONNECTED' }).show() // no name: may show while locked
    act(`UNKNOWN DEVICE · ${u.serial}`)
  }
  for (const sn of warned) if (!unknown.some((u) => u.serialNo === sn)) warned.delete(sn)
  Object.assign(state, { device: next, unknown, phoneLinked: !!current })
  push()
  void refreshStatus()
}

function readIds(): void {
  for (const d of devices) {
    if (!engine || d.state !== 'device' || ids.has(d.serial) || reading.has(d.serial)) continue
    reading.add(d.serial)
    void identify(engine.adb, d.serial)
      .then((id) => { ids.set(d.serial, id) }, (err: Error) => log(`identify failed: ${err.message}`))
      .finally(() => { reading.delete(d.serial); recompute() })
  }
}

function startTracking(p: EnginePaths): void {
  engine = p
  void removeStaleForwards(p.adb).then((n) => { if (n) log(`removed ${n} stale phone forwards`) }, () => undefined)
  tracker = new DeviceTracker(p.adb)
  tracker.on('change', (list: Device[]) => {
    devices = list
    for (const serial of ids.keys()) if (!list.some((d) => d.serial === serial)) { ids.delete(serial); appsCache.delete(serial) }
    log(`devices: ${list.map((d) => `${d.serial}=${d.state}`).join(', ') || 'none'}`)
    readIds()
    recompute()
  })
  tracker.start()
  timers.push(setInterval(() => { readIds(); void refreshStatus() }, 10_000))
}

// The phone screen lives on the Mirror page of the main window.
function openMirror(): void {
  if (!readyDevice() || state.locked) return
  showWindow()
  win?.webContents.send('tether:go', 'mirror')
}

function lock(reason: string): void {
  if (!settings.pinHash) return // no PIN yet: the setup screen is showing anyway
  Object.assign(state, { locked: true, lockReason: reason, status: null })
  push()
}

// Rule 4: lock when Windows locks or the PC sits idle. Phone windows close, the phone stays connected.
function autoLock(why: string): void {
  const n = views.closeAll()
  if (state.locked) return
  act(`AUTO-LOCK · ${why}`)
  lock(`${why} · ${n} PHONE WINDOW${n === 1 ? '' : 'S'} CLOSED`)
}

// Rule 5: closes phone windows, turns off Wireless debugging on known phones, drops Wi-Fi links.
async function doLockdown(): Promise<void> {
  const known = devices.filter((d) => settings.knownPhones.some((k) => k.serialNo === ids.get(d.serial)?.serialNo))
  const { wifiOffFailed } = engine ? await lockdown(engine.adb, views, known) : { wifiOffFailed: [] }
  act('LOCKDOWN')
  lock(`LOCKDOWN · PHONE WINDOWS CLOSED${wifiOffFailed.length ? ' · TURN OFF WIRELESS DEBUGGING ON THE PHONE' : ''}`)
}

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

function saveAppSettings(): void {
  saveSettings(settings)
  Object.assign(state, { pins: settings.pins, appOptions: settings.apps, layouts: settings.layouts })
  push()
}

// Layouts: a saved set of app windows at fixed spots, also on Ctrl+Alt+1–9.
function launchLayout(i: number): void {
  const layout = settings.layouts[i]
  if (!layout || state.locked || !readyDevice()) return
  act(`LAYOUT · ${layout.name.toUpperCase()}`)
  for (const w of layout.windows) views.openApp(w.pkg, w.name, onScreen(w.bounds))
}

// A saved spot on a screen that is gone (monitor unplugged) would open the window out of sight.
function onScreen(b: Bounds): Bounds | null {
  const area = screen.getDisplayMatching(b).workArea
  const visible = b.x < area.x + area.width && b.x + b.width > area.x && b.y < area.y + area.height && b.y + b.height > area.y
  return visible ? b : null
}

function createWindow(): BrowserWindow {
  const w = new BrowserWindow({
    width: 1180, height: 760, show: false, backgroundColor: '#0F0E0D', title: 'TETHER', autoHideMenuBar: true,
    webPreferences: webPreferences(),
  })
  harden(w)
  w.on('close', (e) => {
    if (quitting) return
    e.preventDefault()
    w.hide()
    w.webContents.send('tether:go', 'home') // leaving the Mirror page ends its stream
  })
  w.once('ready-to-show', () => w.show())
  loadRenderer(w)
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
    views.closeAll()
    globalShortcut.unregisterAll()
    tracker?.stop()
    for (const t of timers) clearInterval(t)
    timers = []
  })
  void app.whenReady().then(() => {
    pruneLogs(paths.logs)
    log('start')
    win = createWindow()
    tray = new Tray(trayIcon(false))
    tray.on('click', showWindow)
    powerMonitor.on('lock-screen', () => autoLock('WINDOWS LOCKED'))
    timers.push(setInterval(() => {
      const idle = settings.idleMinutes
      if (idle && !state.locked && powerMonitor.getSystemIdleTime() >= idle * 60) autoLock(`IDLE ${idle} MIN`)
    }, 30_000))
    for (let i = 0; i < 9; i++) {
      if (!globalShortcut.register(`Control+Alt+${i + 1}`, () => launchLayout(i))) log(`shortcut Ctrl+Alt+${i + 1} taken`)
    }
    registerIpc(win, {
      getState: publicState,
      isLocked: () => state.locked,
      setPin: (pin) => {
        if (settings.pinHash) return false
        settings.pinHash = hashPin(pin)
        saveSettings(settings)
        gate = new PinGate(settings.pinHash)
        Object.assign(state, { hasPin: true, locked: false })
        act('PIN SET')
        push()
        void refreshStatus()
        return true
      },
      unlock: (pin) => {
        const result = gate ? gate.tryUnlock(pin) : 'wrong'
        log(`unlock: ${result}`)
        if (result === 'ok') {
          Object.assign(state, { locked: false, lockReason: null })
          act('UNLOCKED · PIN')
          push()
          void refreshStatus()
        }
        return result
      },
      installEngine: doInstallEngine,
      openMirror,
      trust: (serialNo) => {
        const link = state.unknown.find((u) => u.serialNo === serialNo)
        if (!link || settings.knownPhones.some((k) => k.serialNo === serialNo)) return
        const name = link.name ?? serialNo
        settings.knownPhones = [...settings.knownPhones, { serialNo, name, addedAt: new Date().toISOString() }]
        saveSettings(settings)
        state.known = settings.knownPhones
        act(`TRUSTED · ${name}`)
        recompute()
      },
      forget: (serialNo) => {
        const phone = settings.knownPhones.find((k) => k.serialNo === serialNo)
        if (!phone) return
        if (readyDevice()?.serialNo === serialNo) views.closeAll()
        settings.knownPhones = settings.knownPhones.filter((k) => k !== phone)
        saveSettings(settings)
        state.known = settings.knownPhones
        act(`FORGOT · ${phone.name}`)
        recompute()
      },
      lockdown: doLockdown,
      setIdle: (minutes) => {
        settings.idleMinutes = minutes
        saveSettings(settings)
        state.idleMinutes = minutes
        push()
      },
      getActivity: () => readActivity(paths.logs),
      isViewSender: (view, sender) => views.isSender(view, sender),
      attach: (view, sender) => views.attach(view, sender),
      detach: (view) => views.detach(view),
      input: (view, e) => views.input(view, e),
      listApps: async () => {
        const phone = readyDevice()
        if (!engine || !phone) return []
        const cached = appsCache.get(phone.serial)
        if (cached) return cached
        const apps = await listApps(engine, phone.serial)
        appsCache.set(phone.serial, apps)
        return apps
      },
      openApp: (pkg, name) => { if (readyDevice()) views.openApp(pkg, name) },
      setAppOptions: (pkg, opts) => {
        settings.apps = { ...settings.apps, [pkg]: opts }
        views.setOnTop(pkg, opts.onTop) // the rest applies next time the window opens
        saveAppSettings()
      },
      pin: (pkg, name) => {
        if (settings.pins.length >= 8 || settings.pins.some((p) => p.pkg === pkg)) return
        settings.pins = [...settings.pins, { pkg, name }]
        saveAppSettings()
      },
      unpin: (pkg) => {
        settings.pins = settings.pins.filter((p) => p.pkg !== pkg)
        saveAppSettings()
      },
      saveLayout: (name, index) => {
        const windows = views.appWindows().map(({ pkg, win: w }) => ({ pkg, name: w.getTitle(), bounds: w.getBounds() }))
        if (!windows.length || (index === null && settings.layouts.length >= 9) || (index !== null && !settings.layouts[index])) return
        const layout = { name, windows }
        settings.layouts = index === null ? [...settings.layouts, layout] : settings.layouts.map((l, i) => (i === index ? layout : l))
        saveAppSettings()
      },
      launchLayout,
      deleteLayout: (index) => {
        settings.layouts = settings.layouts.filter((_, i) => i !== index)
        saveAppSettings()
      },
    })
    const found = findEngine(paths.engine, process.env.TETHER_ENGINE_DIR)
    if (found) {
      state.engine = 'ready'
      startTracking(found)
    }
    push()
  })
}
