import {
  app, BrowserWindow, clipboard, dialog, globalShortcut, Menu, Notification, powerMonitor, protocol, screen, shell, Tray,
} from 'electron'
import { createReadStream, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, isAbsolute, join } from 'node:path'
import { Readable } from 'node:stream'
import {
  clearNotification, countPlaces, createLog, DeviceTracker, findEngine, getStatus, hashPin, identify, installApk, installEngine, listApps, listDir,
  lockdown, makeDir, pickPhone, PinGate, pruneLogs, pullFiles, pushFiles, readActivity, readNotifications, removeFiles, removeStaleForwards, screenshot, sdCards,
  type Device, type EnginePaths, type PhoneApp, type PhoneLink, type PhoneNotification,
} from '@tether/core'
import { DEFAULT_APP_OPTIONS, type AppOptions, type AppState, type Bounds, type FileOp } from '../shared/api'
import { ClipLink } from './cliplink'
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
let lastNotifs: PhoneNotification[] = [] // the shade as last shown; CLEAR only works on these

const state: AppState = {
  locked: true, hasPin: !!settings.pinHash, lockReason: null, phoneLinked: false, // locked until a password is set or entered
  weakPassword: false,
  engine: 'missing', engineProgress: null, enginePct: null, engineError: null,
  device: null, status: null, unknown: [], known: settings.knownPhones, idleMinutes: settings.idleMinutes,
  openViews: [], pins: settings.pins, appOptions: settings.apps, layouts: settings.layouts,
  clips: [], clipStats: { synced: 0, wiped: 0 }, clipSettings: settings.clip, clipLink: 'off', fileOp: { busy: false, text: null, error: false },
}

// The renderer never sees phone data while locked.
const publicState = (): AppState => state.locked
  ? { ...state, device: null, status: null, unknown: [], known: [], openViews: [], pins: [], appOptions: {}, layouts: [],
      clips: [], clipStats: { synced: 0, wiped: 0 }, clipLink: 'off', fileOp: { busy: false, text: null, error: false } }
  : { ...state, clips: clipLink.clips, clipStats: { ...clipLink.stats }, clipLink: clipLink.state }
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

const APP_ID = 'com.tether.desktop' // = electron-builder.yml appId (ties toasts + taskbar to the installer's shortcut)
// Installed: extraResources next to app.asar. Dev: out/main → apps/desktop/resources.
const resource = (name: string) => app.isPackaged ? join(process.resourcesPath, name) : join(__dirname, '../../resources', name)
const icon = resource('icon.ico')
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
      show: false, backgroundColor: '#0F0E0D', title: name, icon, alwaysOnTop: opts.onTop, autoHideMenuBar: true,
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

const clipLink = new ClipLink({
  engine: () => engine,
  serial: () => (state.locked ? null : readyDevice()?.serial ?? null),
  settings: () => settings.clip,
  log,
  onChange: () => push(),
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
  clipLink.update()
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
  clipLink.update() // sync stops while locked
  clipLink.clear()
  lastNotifs = []
  closePreviews()
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

// --- Files, screenshot, recording (M4) ---

const saveDir = () => join(app.getPath('downloads'), 'Tether')
// Phone facts (CMF Phone 1, 2026-10-30); folders a phone doesn't have are left out.
const PLACES = [
  { name: 'Camera', dir: '/sdcard/DCIM/Camera' },
  { name: 'Screenshots', dir: '/sdcard/Pictures/Screenshots' },
  { name: 'Screenshots', dir: '/sdcard/DCIM/Screenshots' },
  { name: 'Downloads', dir: '/sdcard/Download' },
  { name: 'WhatsApp', dir: '/sdcard/Android/media/com.whatsapp/WhatsApp/Media' },
  { name: 'Documents', dir: '/sdcard/Documents' },
  { name: 'Music', dir: '/sdcard/Music' },
]
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 'S'}`
const isLocalFile = (p: string) => {
  try {
    return isAbsolute(p) && statSync(p).isFile()
  } catch {
    return false
  }
}

function stamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

async function phoneApps(serial: string): Promise<PhoneApp[]> {
  const cached = appsCache.get(serial)
  if (cached || !engine) return cached ?? []
  const apps = await listApps(engine, serial)
  appsCache.set(serial, apps)
  return apps
}

function phone(): { adb: string; serial: string } {
  const d = readyDevice()
  if (!engine || !d || state.locked) throw new Error('NO PHONE')
  return { adb: engine.adb, serial: d.serial }
}

function setFileOp(op: FileOp): void {
  state.fileOp = op
  push()
}

// One file operation at a time; its outcome shows on the Files LCD.
async function fileJob(busy: string, job: (adb: string, serial: string) => Promise<string>): Promise<void> {
  if (state.fileOp.busy) throw new Error('ONE THING AT A TIME')
  const { adb, serial } = phone()
  setFileOp({ busy: true, text: busy, error: false })
  try {
    setFileOp({ busy: false, text: await job(adb, serial), error: false })
  } catch (err) {
    log(`file job failed: ${(err as Error).message}`)
    setFileOp({ busy: false, text: (err as Error).message.toUpperCase().slice(0, 80), error: true })
  }
}

function sendFiles(paths: string[], dir: string): Promise<void> {
  return fileJob(`SENDING ${plural(paths.length, 'FILE')}`, async (adb, serial) => {
    if (!paths.every(isLocalFile)) throw new Error('ONLY FILES CAN BE SENT')
    const { sent, failed } = await pushFiles(adb, serial, paths, dir)
    if (sent) act(`SENT ${plural(sent, 'FILE')}`)
    if (failed.length) throw new Error(`SENT ${sent} · ${failed.length} FAILED`)
    return `SENT ${plural(sent, 'FILE')} · ${placeName(dir)}`
  })
}

// '/sdcard/DCIM/Camera/' → 'CAMERA'; a storage root → 'PHONE' / 'SD CARD'.
function placeName(dir: string): string {
  if (/^\/(sdcard|storage\/emulated\/0)\/?$/.test(dir)) return 'PHONE'
  if (/^\/storage\/[0-9A-F]{4}-[0-9A-F]{4}\/?$/.test(dir)) return 'SD CARD'
  return basename(dir).toUpperCase()
}

// Preview: the file is copied to %LOCALAPPDATA%\Tether\preview and shown in a small window by Chromium's own
// viewers (photo, video, audio, PDF incl. password-locked, text). Other kinds open in their Windows app.
// The copies are deleted when the window closes, on lock and at start/quit.
const previewDir = join(paths.root, 'preview')
const PREVIEW_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
  '.avif': 'image/avif', '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/mp4', '.webm': 'video/webm', '.mkv': 'video/webm',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.oga': 'audio/ogg',
  '.opus': 'audio/ogg', '.flac': 'audio/flac', '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8', '.log': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
  '.csv': 'text/plain; charset=utf-8', '.json': 'text/plain; charset=utf-8', '.srt': 'text/plain; charset=utf-8',
}
// One preview window per open; ‹ › step through the photos/videos/audio of the same folder (newest first,
// like the Files list). PDFs open alone in Chromium's viewer (a framed window, no TETHER bar).
interface PreviewWin { dir: string; names: string[]; i: number }
const previews = new Map<BrowserWindow, PreviewWin>()

function previewKind(name: string): 'image' | 'video' | 'audio' | 'text' | 'pdf' | null {
  const type = PREVIEW_TYPES[extname(name).toLowerCase()]
  if (!type) return null
  return type === 'application/pdf' ? 'pdf' : (type.split('/')[0] as 'image' | 'video' | 'audio' | 'text')
}
const isMedia = (name: string) => ['image', 'video', 'audio'].includes(previewKind(name) ?? '')

function clearPreviews(): void {
  rmSync(previewDir, { recursive: true, force: true })
}

function closePreviews(): void {
  for (const w of [...previews.keys()]) w.destroy()
}

// Serves only files sitting in the preview folder, always with our own content type (never HTML/SVG/script).
// Byte ranges are answered so the player can seek.
function servePreview(req: Request): Response {
  const name = decodeURIComponent(new URL(req.url).pathname.slice(1))
  const type = PREVIEW_TYPES[extname(name).toLowerCase()]
  const file = join(previewDir, name)
  if (!type || !name || name !== basename(name) || !existsSync(file)) return new Response('not found', { status: 404 })
  const size = statSync(file).size
  const headers: Record<string, string> = {
    'content-type': type, 'accept-ranges': 'bytes',
    'access-control-allow-origin': '*', // the TETHER page reads text files with fetch()
  }
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') ?? '')
  let start = 0
  let end = size - 1
  if (m && (m[1] || m[2])) {
    start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]))
    end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } })
    headers['content-range'] = `bytes ${start}-${end}/${size}`
  }
  headers['content-length'] = String(end - start + 1)
  const body = size ? (Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream) : null
  return new Response(body, { status: headers['content-range'] ? 206 : 200, headers })
}

function showPreview(w: BrowserWindow, p: PreviewWin): void {
  const name = p.names[p.i]
  const kind = previewKind(name)!
  w.setTitle(name)
  if (kind === 'pdf') void w.loadURL(`tether-preview://file/${encodeURIComponent(name)}`)
  else loadRenderer(w, { preview: name, kind, pos: p.names.length > 1 ? `${p.i + 1}/${p.names.length}` : '' })
}

function openPreview(p: PreviewWin): void {
  const pdf = previewKind(p.names[p.i]) === 'pdf'
  const w = new BrowserWindow({
    width: 960, height: 720, backgroundColor: '#0F0E0D', title: p.names[p.i], icon, autoHideMenuBar: true,
    ...(pdf ? {} : { titleBarStyle: 'hidden' as const, titleBarOverlay: { color: '#161513', symbolColor: '#EFECE6', height: TITLE_BAR } }),
    // plugins = Chromium's PDF viewer (off by default: a PDF would turn into a download and close the window)
    webPreferences: { ...webPreferences(), plugins: true, autoplayPolicy: 'no-user-gesture-required' },
  })
  harden(w)
  previews.set(w, p)
  w.on('page-title-updated', (e) => e.preventDefault()) // keep the file name as the title
  w.on('closed', () => {
    previews.delete(w)
    rmSync(join(previewDir, p.names[p.i]), { force: true })
  })
  showPreview(w, p)
}

function previewFile(remote: string): Promise<void> {
  const name = basename(remote)
  const dir = remote.slice(0, remote.length - name.length)
  return fileJob(`OPENING ${name.toUpperCase()}`, async (adb, serial) => {
    mkdirSync(previewDir, { recursive: true })
    const { failed } = await pullFiles(adb, serial, [remote], previewDir)
    if (failed.length) throw new Error(`COULDN'T COPY ${name}`)
    if (!previewKind(name)) {
      const error = await shell.openPath(join(previewDir, name))
      if (error) throw new Error(`NO APP ON THIS PC OPENS ${extname(name).toUpperCase() || 'THIS FILE'}`)
      return `OPENED ON PC · ${name.toUpperCase()}`
    }
    let names = [name]
    if (isMedia(name)) {
      const siblings = (await listDir(adb, serial, dir).catch(() => []))
        .filter((e) => !e.dir && !e.name.startsWith('.') && isMedia(e.name))
        .sort((a, b) => b.mtime.localeCompare(a.mtime))
        .map((e) => e.name)
      if (siblings.includes(name)) names = siblings
    }
    openPreview({ dir, names, i: names.indexOf(name) })
    return `OPENED ${name.toUpperCase()}`
  })
}

// ‹ › in a preview window: copy the next file over, drop the old copy, show it.
async function stepPreview(w: BrowserWindow, delta: 1 | -1): Promise<void> {
  const p = previews.get(w)
  if (!p || p.names.length < 2) return
  const { adb, serial } = phone()
  const i = (p.i + delta + p.names.length) % p.names.length
  const { failed } = await pullFiles(adb, serial, [p.dir + p.names[i]], previewDir)
  if (failed.length) throw new Error(`COULDN'T COPY ${p.names[i]}`)
  if (previews.get(w) !== p || w.isDestroyed()) return void rmSync(join(previewDir, p.names[i]), { force: true })
  rmSync(join(previewDir, p.names[p.i]), { force: true })
  p.i = i
  showPreview(w, p)
}

function notifySaved(body: string, file: string): void {
  const n = new Notification({ title: 'TETHER', body, icon })
  n.on('click', () => shell.showItemInFolder(file))
  n.show()
}

function createWindow(): BrowserWindow {
  const w = new BrowserWindow({
    width: 1180, height: 760, show: false, backgroundColor: '#0F0E0D', title: 'TETHER', icon, autoHideMenuBar: true,
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
if (app.isPackaged) app.setAppUserModelId(APP_ID) // dev keeps Electron's default (no shortcut carries APP_ID there)
protocol.registerSchemesAsPrivileged([{ scheme: 'tether-preview', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } }])
if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', showWindow)
  app.on('window-all-closed', () => { /* tray app: keep running */ })
  app.on('before-quit', () => {
    quitting = true
    views.closeAll()
    globalShortcut.unregisterAll()
    tracker?.stop()
    clipLink.stop()
    closePreviews()
    clearPreviews()
    for (const t of timers) clearInterval(t)
    timers = []
  })
  void app.whenReady().then(() => {
    pruneLogs(paths.logs)
    clearPreviews()
    protocol.handle('tether-preview', servePreview)
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
        act('PASSWORD SET')
        clipLink.update()
        push()
        void refreshStatus()
        return true
      },
      unlock: (pin) => {
        const result = gate ? gate.tryUnlock(pin) : 'wrong'
        log(`unlock: ${result}`)
        if (result === 'ok') {
          Object.assign(state, { locked: false, lockReason: null, weakPassword: pin.length < 8 })
          act('UNLOCKED · PASSWORD')
          clipLink.update()
          push()
          void refreshStatus()
        }
        return result
      },
      changePassword: (current, next) => {
        const result = gate ? gate.tryUnlock(current) : 'wrong'
        log(`change password: ${result}`)
        if (result !== 'ok') return result
        settings.pinHash = hashPin(next)
        saveSettings(settings)
        gate = new PinGate(settings.pinHash)
        state.weakPassword = false
        act('PASSWORD CHANGED')
        push()
        return 'ok'
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
      input: (view, e) => {
        if (e.t !== 'paste') return views.input(view, e)
        void clipboard.readText().then((text) => views.paste(view, text), () => undefined)
      },
      listApps: async () => {
        const phone = readyDevice()
        return engine && phone ? phoneApps(phone.serial) : []
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
      listDir: (dir) => listDir(phone().adb, phone().serial, dir),
      countPlaces: async () => {
        const { adb, serial } = phone()
        const cards = await sdCards(adb, serial)
        const all = [...PLACES, ...cards.map((dir, i) => ({ name: cards.length > 1 ? `SD card ${i + 1}` : 'SD card', dir }))]
        const counts = await countPlaces(adb, serial, all.map((p) => p.dir))
        const found = all.map((p, i) => ({ ...p, count: counts[i] })).filter((p) => p.count !== null)
        return found.filter((p, i) => found.findIndex((q) => q.name === p.name) === i)
      },
      sendFiles,
      previewFile,
      isPreviewSender: (sender) => [...previews.keys()].some((w) => w.webContents === sender),
      previewStep: (sender, delta) => {
        const w = [...previews.keys()].find((x) => x.webContents === sender)
        return w ? stepPreview(w, delta) : Promise.resolve()
      },
      pickAndSend: async (dir) => {
        const r = await dialog.showOpenDialog(win!, { title: 'Send to phone', properties: ['openFile', 'multiSelections'] })
        if (!r.canceled && r.filePaths.length) await sendFiles(r.filePaths, dir)
      },
      saveToPc: (paths) => fileJob(`SAVING ${plural(paths.length, 'FILE')}`, async (adb, serial) => {
        mkdirSync(saveDir(), { recursive: true })
        const { saved, failed } = await pullFiles(adb, serial, paths, saveDir())
        if (saved) act(`SAVED ${plural(saved, 'FILE')}`)
        if (failed.length) throw new Error(`SAVED ${saved} · ${failed.length} FAILED`)
        return `SAVED ${saved} · OPEN FOLDER`
      }),
      deleteFiles: (paths) => fileJob(`DELETING ${plural(paths.length, 'FILE')}`, async (adb, serial) => {
        await removeFiles(adb, serial, paths)
        act(`DELETED ${plural(paths.length, 'FILE')}`)
        return `DELETED ${plural(paths.length, 'FILE')}`
      }),
      newFolder: (path) => fileJob('MAKING FOLDER', async (adb, serial) => {
        await makeDir(adb, serial, path)
        return 'FOLDER MADE'
      }),
      installApk: (path) => fileJob(`INSTALLING ${basename(path).toUpperCase()}`, async (adb, serial) => {
        if (!isLocalFile(path)) throw new Error('APK NOT FOUND')
        await installApk(adb, serial, path)
        act(`INSTALLED ${basename(path)}`)
        return `INSTALLED ${basename(path).toUpperCase()}`
      }),
      openSaveFolder: async () => {
        mkdirSync(saveDir(), { recursive: true })
        await shell.openPath(saveDir())
      },
      listNotifications: async () => {
        if (!readyDevice()) return []
        const { adb, serial } = phone()
        lastNotifs = await readNotifications(adb, serial)
        const names = new Map((await phoneApps(serial).catch(() => [])).map((a) => [a.pkg, a.name]))
        return lastNotifs.map((n) => ({ ...n, app: names.get(n.pkg) ?? (n.pkg === 'android' || n.pkg === 'com.android.systemui' ? 'System' : n.pkg) }))
      },
      clearNotification: async (key) => {
        const n = lastNotifs.find((x) => x.key === key)
        if (!n?.clearable) throw new Error('NOT IN THE SHADE')
        const { adb, serial } = phone()
        await clearNotification(adb, serial, key)
        lastNotifs = lastNotifs.filter((x) => x !== n)
        act(`NOTIFICATION CLEARED · ${n.pkg}`) // package only, never the text
      },
      copyClip: (id) => clipLink.copyClip(id),
      sendClip: (id) => clipLink.sendClip(id),
      pasteToPhone: () => clipLink.pasteToPhone(),
      clearClips: () => clipLink.clear(),
      setClipSettings: (s) => {
        if (s.sync !== settings.clip.sync) act(`CLIPBOARD SYNC ${s.sync ? 'ON' : 'OFF'}`)
        settings.clip = s
        saveSettings(settings)
        state.clipSettings = s
        push()
      },
      screenshot: async () => {
        const { adb, serial } = phone()
        mkdirSync(saveDir(), { recursive: true })
        const file = join(saveDir(), `Screenshot_${stamp()}.png`)
        await screenshot(adb, serial, file)
        notifySaved('SCREENSHOT SAVED', file)
      },
      screenOff: () => clipLink.screenOff(),
      saveRecording: async (data) => {
        mkdirSync(saveDir(), { recursive: true })
        const file = join(saveDir(), `Recording_${stamp()}.mp4`)
        writeFileSync(file, Buffer.from(data))
        notifySaved('RECORDING SAVED', file)
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
