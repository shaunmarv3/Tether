// Live phone screens. A view = one scrcpy stream drawn by a renderer: the main window's dock or its pop-out window
// (main display, view 'mirror'), or an app window (virtual display). One audio-only stream plays phone sound while any view is open.
import type { BrowserWindow, WebContents } from 'electron'
import { codecString, enc, PhoneStream, type EnginePaths, type ServerOptions, type StreamEvent } from '@tether/core'
import type { AppOptions, Bounds, InputEvent, VideoMsg, ViewId } from '../shared/api'

const H264 = 0x68323634
const RAW = 0x00726177
export const TITLE_BAR = 36 // app window title bar height (px), drawn by the renderer

export interface ViewsDeps {
  engine(): EnginePaths | null
  phone(): { serial: string; android: number } | null // the current known phone, ready
  mainWindow(): BrowserWindow | null
  appOptions(pkg: string): AppOptions
  makeAppWindow(pkg: string, name: string, opts: AppOptions, bounds: Bounds | null): BrowserWindow
  makePhoneWindow(): BrowserWindow // the pop-out: the main display in its own window
  onChange(): void
  log(msg: string): void
}

interface Live { stream: PhoneStream; sender: WebContents; landscape: boolean | null }

function appServerOptions(o: AppOptions): Omit<ServerOptions, 'scid'> {
  const size: [number, number] | null = o.shape === 'tablet' ? [1920, 1200] : o.shape === 'free' ? [900, 640] : null
  const dpi = o.shape === 'tablet' ? 240 : o.shape === 'free' ? 160 : null
  return {
    video: true, audio: false, control: true, keepActive: false, powerOn: false, clipboard: false,
    display: { size, dpi, flex: o.shape === 'free', keepContent: o.keepRunning, decorations: !o.hideStatusBar, ime: o.pcKeyboard ? 'hide' : 'local' },
  }
}

const pkgOf = (id: ViewId) => (id === 'mirror' ? null : id.slice(4))

export class Views {
  private live = new Map<ViewId, Live>()
  private windows = new Map<string, { win: BrowserWindow; placed: boolean }>() // by package
  private audio: PhoneStream | null = null
  private audioFailed = false
  private phoneWin: BrowserWindow | null = null // while open, it owns 'mirror' instead of the main window

  constructor(private deps: ViewsDeps) {}

  openViews(): ViewId[] {
    return [...new Set<ViewId>([...this.live.keys(), ...[...this.windows.keys()].map((p) => `app:${p}` as const)])]
  }

  // Mirror → the pop-out window while it is open, else the main window; app:<pkg> → only that app's window.
  isSender(id: ViewId, sender: WebContents): boolean {
    const pkg = pkgOf(id)
    if (pkg !== null) return sender === this.windows.get(pkg)?.win.webContents
    return sender === (this.phoneWin ?? this.deps.mainWindow())?.webContents
  }

  popped(): boolean { return !!this.phoneWin }

  // The dock's stream ends first; the pop-out attaches its own once it loads (it owns 'mirror' from now on).
  popOut(): void {
    if (this.phoneWin) { this.phoneWin.show(); this.phoneWin.focus(); return }
    this.detach('mirror')
    const win = this.deps.makePhoneWindow()
    this.phoneWin = win
    win.on('closed', () => {
      if (this.phoneWin !== win) return
      this.phoneWin = null
      this.detach('mirror') // back to the dock
      this.deps.onChange()
    })
    this.deps.onChange()
  }

  bringBack(): void { this.phoneWin?.close() }

  async attach(id: ViewId, sender: WebContents): Promise<void> {
    this.detach(id)
    const send = (m: VideoMsg) => { if (!sender.isDestroyed()) sender.send('tether:video', id, m) }
    const engine = this.deps.engine()
    const phone = this.deps.phone()
    if (!engine || !phone) return send({ kind: 'closed', error: 'NO PHONE' })

    const pkg = pkgOf(id)
    const opts: Omit<ServerOptions, 'scid'> = pkg === null
      ? { video: true, audio: false, control: true, keepActive: true, powerOn: true, clipboard: false, display: null }
      : appServerOptions(this.deps.appOptions(pkg))
    const stream = new PhoneStream(engine, phone.serial, opts)
    const entry: Live = { stream, sender, landscape: null }
    this.live.set(id, entry)
    stream.on('log', (line: string) => this.deps.log(`view ${id}: ${line}`))
    stream.on('video', (e: StreamEvent) => {
      if (e.type === 'codec') {
        if (e.id !== H264) stream.close('PHONE CANNOT SEND VIDEO')
      } else if (e.type === 'session') {
        send({ kind: 'session', width: e.width, height: e.height })
        if (pkg) this.fitWindow(pkg, entry, e.width, e.height)
      } else if (e.config) {
        try {
          send({ kind: 'config', codec: codecString(e.data), data: e.data })
        } catch (err) {
          stream.close((err as Error).message)
        }
      } else {
        send({ kind: 'frame', key: e.key, pts: e.pts, data: e.data })
      }
    })
    stream.once('close', (error: string | null) => {
      if (this.live.get(id) !== entry) return // detached on purpose; a new view may already use this id
      if (error) this.deps.log(`view ${id} closed: ${error}`)
      send({ kind: 'closed', error })
      this.live.delete(id)
      this.updateAudio()
      this.deps.onChange()
    })
    this.deps.onChange()
    this.updateAudio()
    try {
      await stream.start()
    } catch {
      return // 'close' already reported it
    }
    stream.send(pkg === null ? enc.displayPower(false) : enc.startApp(pkg))
  }

  detach(id: ViewId): void {
    const entry = this.live.get(id)
    if (!entry) return
    this.live.delete(id)
    entry.stream.close()
    this.updateAudio()
    this.deps.onChange()
  }

  input(id: ViewId, e: InputEvent): void {
    const entry = this.live.get(id)
    if (!entry || e.t === 'paste') return // paste: see paste()
    try {
      const msg = e.t === 'touch' ? enc.touch(e.action, e.x, e.y, e.w, e.h)
        : e.t === 'scroll' ? enc.scroll(e.x, e.y, e.w, e.h, e.hs, e.vs)
        : e.t === 'key' ? enc.key(e.action, e.keycode)
        : e.t === 'text' ? enc.text(e.text)
        : e.t === 'rotate' ? enc.rotate()
        : e.t === 'reset' ? enc.resetVideo()
        : enc.resize(e.w, e.h)
      if (!entry.stream.send(msg)) this.deps.log(`input dropped: ${id} has no control link yet`)
    } catch (err) {
      this.deps.log(`input dropped: ${(err as Error).message}`)
    }
  }

  // Ctrl+V on a phone view: the PC text goes to the phone clipboard and is pasted into the focused field.
  paste(id: ViewId, text: string): void {
    const entry = this.live.get(id)
    if (!entry || !text) return
    try {
      entry.stream.send(enc.setClipboard(0, text, true))
    } catch (err) {
      this.deps.log(`paste dropped: ${(err as Error).message}`)
    }
  }

  openApp(pkg: string, name: string, bounds: Bounds | null = null): void {
    const open = this.windows.get(pkg)
    if (open) {
      if (bounds) open.win.setBounds(bounds)
      open.win.show()
      open.win.focus()
      return
    }
    const win = this.deps.makeAppWindow(pkg, name, this.deps.appOptions(pkg), bounds)
    this.windows.set(pkg, { win, placed: !!bounds })
    win.on('closed', () => {
      this.windows.delete(pkg)
      this.detach(`app:${pkg}`)
      this.deps.onChange()
    })
    this.deps.onChange()
  }

  appWindows(): { pkg: string; win: BrowserWindow }[] {
    return [...this.windows].map(([pkg, w]) => ({ pkg, win: w.win }))
  }

  setOnTop(pkg: string, on: boolean): void {
    this.windows.get(pkg)?.win.setAlwaysOnTop(on)
  }

  // Lock, Lockdown, forget, quit: every phone screen goes away. Returns how many were open.
  closeAll(): number {
    const n = this.openViews().length
    for (const { win } of [...this.windows.values()]) win.destroy()
    this.phoneWin?.destroy()
    for (const id of [...this.live.keys()]) this.detach(id)
    return n
  }

  // Keep the long side of the video area when the phone screen turns; a window placed by a layout keeps its first size.
  private fitWindow(pkg: string, entry: Live, w: number, h: number): void {
    const open = this.windows.get(pkg)
    const landscape = w > h
    if (!open || this.deps.appOptions(pkg).shape === 'free' || entry.landscape === landscape) return
    const first = entry.landscape === null
    entry.landscape = landscape
    if (first && open.placed) return
    const [cw, ch] = open.win.getContentSize()
    const long = Math.max(cw, ch - TITLE_BAR)
    const [vw, vh] = landscape ? [long, Math.round((long * h) / w)] : [Math.round((long * w) / h), long]
    open.win.setContentSize(vw, vh + TITLE_BAR)
  }

  private updateAudio(): void {
    const phone = this.deps.phone()
    // Android < 11 can't capture audio; an unknown version (0, status not read yet) just tries and gets "disabled".
    const want = this.live.size > 0 && !!phone && (phone.android === 0 || phone.android >= 11) && !!this.deps.engine()
    if (!want) {
      this.audioFailed = false
      this.audio?.close()
      this.audio = null
      return
    }
    if (this.audio || this.audioFailed) return
    const stream = new PhoneStream(this.deps.engine()!, phone.serial,
      { video: false, audio: true, control: false, keepActive: false, powerOn: false, clipboard: false, display: null })
    this.audio = stream
    stream.on('audio', (e: StreamEvent) => {
      if (e.type === 'codec' && e.id !== RAW) stream.close(e.id === 0 ? 'phone audio not available' : 'audio config error')
      else if (e.type === 'packet' && !e.config) {
        const wc = this.deps.mainWindow()?.webContents
        if (wc && !wc.isDestroyed()) wc.send('tether:audio', e.data)
      }
    })
    stream.once('close', (error: string | null) => {
      if (this.audio !== stream) return
      this.audio = null
      if (error) {
        this.audioFailed = true // don't retry until every view is closed
        this.deps.log(`audio closed: ${error}`)
      }
    })
    void stream.start().catch(() => undefined)
  }
}
