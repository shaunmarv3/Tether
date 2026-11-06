import { useEffect, useRef, useState } from 'react'
import type { AppState } from '../shared/api'
import { playPhoneAudio } from './audio'
import { Dock, useRecorder } from './Dock'
import { Drawer } from './Drawer'
import { layoutMode } from './layout'
import type { ViewInfo } from './PhoneView'
import { Apps } from './screens/Apps'
import { Clipboard } from './screens/Clipboard'
import { Connect } from './screens/Connect'
import { Engine } from './screens/Engine'
import { Files, friendlyPath } from './screens/Files'
import { Home } from './screens/Home'
import { Layouts } from './screens/Layouts'
import { Lock } from './screens/Lock'
import { Notifications } from './screens/Notifications'
import { Pilot, PilotAsk, PilotPip } from './screens/Pilot'
import { Security } from './screens/Security'
import { useNow } from './screens/Clipboard'
import { Banners, DropOverlay, fileToast, pageName, Shell, Toasts, type Page, type Toast } from './Shell'
import { tether } from './tether'

const DOWNLOAD = '/sdcard/Download/'
const isApk = (p: string) => p.toLowerCase().endsWith('.apk')
const clock = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }

// The dock's open/collapsed choice, per page (renderer-only convenience; storage may be unavailable).
const dockKey = (p: Page) => `tether.dock.${p}`
function savedDock(p: Page): boolean {
  try { const v = localStorage.getItem(dockKey(p)); if (v !== null) return v === '1' } catch { /* default below */ }
  return p !== 'files' && p !== 'security'
}

export function App() {
  const [state, setState] = useState<AppState | null>(null)
  const [page, setPage] = useState<Page>('home')
  const [ignored, setIgnored] = useState<string[]>([]) // unknown phones hidden until they reconnect
  const [filesDir, setFilesDir] = useState('/sdcard/DCIM/Camera/')
  const [dragging, setDragging] = useState(false)
  const [apks, setApks] = useState<string[]>([]) // dropped APKs waiting for INSTALL / CANCEL
  const [toast, setToast] = useState<AppState['fileOp'] | null>(null)
  const [skipped, setSkipped] = useState(false) // first-run Connect: LATER, this session only
  const [note, setNote] = useState<Toast | null>(null) // dock results: screenshot, recording, paste…
  const [docks, setDocks] = useState<Partial<Record<Page, boolean>>>({})
  const [visible, setVisible] = useState(true) // main window shown (not hidden to the tray or minimised)
  const [info, setInfo] = useState<ViewInfo | null>(null)
  const [stream, setStream] = useState<{ w: number; h: number } | null>(null)
  const dockOpen = docks[page] ?? savedDock(page)
  const setDockOpen = (on: boolean, p: Page = page) => {
    setDocks((d) => ({ ...d, [p]: on }))
    try { localStorage.setItem(dockKey(p), on ? '1' : '0') } catch { /* this session only */ }
  }
  const recorder = useRecorder(!!state?.locked, setNote)
  const [win, setWin] = useState({ w: window.innerWidth, h: window.innerHeight })
  const [drawer, setDrawer] = useState(false) // landscape / small window: the page slides over the phone
  const mode = layoutMode(win, stream, dockOpen)
  useEffect(() => { if (mode === 'split') setDrawer(false) }, [mode])
  const now = useNow()
  const open = !!state && !state.locked && state.hasPin && state.engine === 'ready'
  const where = useRef({ page, filesDir })
  where.current = { page, filesDir }
  const openDock = useRef(() => {})
  openDock.current = () => setDockOpen(true)

  useEffect(() => {
    const off = tether.onState(setState)
    const offGo = tether.onGo(() => openDock.current()) // tray "Mirror"
    const offVisible = tether.onVisible(setVisible)
    void tether.getState().then(setState)
    return () => { off(); offGo(); offVisible() }
  }, [])

  useEffect(() => {
    const resize = () => setWin({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  useEffect(() => {
    if (!note || note.kind === 'busy') return
    const t = setTimeout(() => setNote(null), 5000)
    return () => clearTimeout(t)
  }, [note])
  const onInfo = (i: ViewInfo | null) => {
    setInfo(i)
    if (i) setStream((s) => (s && s.w === i.width && s.h === i.height ? s : { w: i.width, h: i.height }))
  }

  useEffect(() => {
    if (state) setIgnored((prev) => prev.filter((sn) => state.unknown.some((u) => u.serialNo === sn)))
  }, [state?.unknown])

  // Locking closes every phone screen and starts over on Home.
  useEffect(() => { if (state?.locked) { setPage('home'); setApks([]) } }, [state?.locked])
  useEffect(() => (open ? playPhoneAudio() : undefined), [open])

  // Outside the Files page, a file result shows as a toast for a few seconds.
  const op = state?.fileOp
  useEffect(() => {
    if (!op?.text) return setToast(null)
    setToast(op)
    if (op.busy) return
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [op?.text, op?.busy, op?.error])

  // Drop files anywhere: APKs ask first, the rest go to the open Files folder (or Download).
  useEffect(() => {
    if (!open) return
    let depth = 0
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files')
    const enter = (e: DragEvent) => { if (hasFiles(e)) { e.preventDefault(); depth++; setDragging(true) } }
    const over = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault() }
    const leave = () => { if (--depth <= 0) { depth = 0; setDragging(false) } }
    const drop = (e: DragEvent) => {
      e.preventDefault()
      depth = 0
      setDragging(false)
      const paths = [...(e.dataTransfer?.files ?? [])].map((f) => tether.pathForFile(f)).filter(Boolean)
      const rest = paths.filter((p) => !isApk(p))
      setApks((a) => [...a, ...paths.filter(isApk)])
      const dir = where.current.page === 'files' ? where.current.filesDir : DOWNLOAD
      if (rest.length) void tether.sendFiles(rest, dir)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [open])

  if (!state) return null
  if (state.locked || !state.hasPin) return <Lock state={state} />
  if (state.engine !== 'ready') return <Engine state={state} />
  if (!state.known.length && !skipped) return <Connect state={state} skip={() => setSkipped(true)} />
  const ready = state.device?.state === 'device'
  const content = (
    <>
      <Banners state={state} ignored={ignored} ignore={(sn) => setIgnored((p) => [...p, sn])} go={setPage} />
      <div className="pane-content">
        {page === 'home' && <Home state={state} go={setPage} />}
        {page === 'apps' && <Apps state={state} />}
        {page === 'files' && <Files state={state} dir={filesDir} setDir={(d) => setFilesDir(d.endsWith('/') ? d : `${d}/`)} />}
        {page === 'clipboard' && <Clipboard state={state} />}
        {page === 'notifications' && <Notifications state={state} />}
        {page === 'pilot' && <Pilot state={state} />}
        {page === 'layouts' && <Layouts state={state} />}
        {page === 'security' && <Security state={state} />}
      </div>
    </>
  )
  const toasts = (
    <Toasts toast={note ?? (toast && page !== 'files' ? fileToast(toast) : null)} apks={apks} installReady={ready && !state.fileOp.busy}
      install={() => { void tether.installApk(apks[0]); setApks((a) => a.slice(1)) }} cancel={() => setApks((a) => a.slice(1))} />
  )
  // In landscape / small windows the rail opens pages in the drawer; the current page again closes it.
  const onRail = (p: Page) => { if (p === page && drawer) setDrawer(false); else { setPage(p); setDrawer(true) } }
  return (
    <Shell state={state} page={page} go={setPage} onRail={mode === 'split' ? undefined : onRail} compact={mode === 'compact'} info={info}
      hint={mode === 'compact' ? 'Widen the window to see pages beside the phone'
        : mode === 'landscape' ? 'Click a page in the rail to slide it over the phone' : undefined}
      dock={<Dock state={state} mode={mode} open={dockOpen} setOpen={setDockOpen} visible={visible} info={info} stream={stream} onInfo={onInfo}
        recorder={recorder} notify={setNote} />}
      badges={recorder.startedAt !== null && (
        <>
          <span className="live-badge rec" role="status"><span className="dot" />Recording {clock(now - recorder.startedAt)}</span>
          <button className="btn small" onClick={recorder.stop}>Stop</button>
        </>
      )}>
      {mode === 'split' ? <div className="pane">{content}{toasts}</div>
        : drawer ? <Drawer title={pageName(page)} onClose={() => setDrawer(false)}>{content}{toasts}</Drawer> : toasts}
      {dragging && <DropOverlay ready={ready} where={friendlyPath(page === 'files' ? filesDir : DOWNLOAD)} />}
      {ready && !(dockOpen && visible) && state.pilot.current?.status === 'running' && (
        <PilotPip ai={state.pilot.current} open={() => setDockOpen(true)} />
      )}
      {state.pilot.question && <PilotAsk q={state.pilot.question} />}
    </Shell>
  )
}
