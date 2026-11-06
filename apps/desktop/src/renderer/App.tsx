import { useEffect, useRef, useState } from 'react'
import type { AppState } from '../shared/api'
import { playPhoneAudio } from './audio'
import { Apps } from './screens/Apps'
import { Clipboard } from './screens/Clipboard'
import { Connect } from './screens/Connect'
import { Engine } from './screens/Engine'
import { Files, friendlyPath } from './screens/Files'
import { Home } from './screens/Home'
import { Layouts } from './screens/Layouts'
import { Lock } from './screens/Lock'
import { Mirror } from './screens/Mirror'
import { Notifications } from './screens/Notifications'
import { Pilot, PilotAsk, PilotPip } from './screens/Pilot'
import { Security } from './screens/Security'
import { Banners, DropOverlay, fileToast, Shell, Toasts, type Page } from './Shell'
import { tether } from './tether'

const DOWNLOAD = '/sdcard/Download/'
const isApk = (p: string) => p.toLowerCase().endsWith('.apk')

export function App() {
  const [state, setState] = useState<AppState | null>(null)
  const [page, setPage] = useState<Page>('home')
  const [ignored, setIgnored] = useState<string[]>([]) // unknown phones hidden until they reconnect
  const [filesDir, setFilesDir] = useState('/sdcard/DCIM/Camera/')
  const [recordAsked, setRecordAsked] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [apks, setApks] = useState<string[]>([]) // dropped APKs waiting for INSTALL / CANCEL
  const [toast, setToast] = useState<AppState['fileOp'] | null>(null)
  const [skipped, setSkipped] = useState(false) // first-run Connect: LATER, this session only
  const open = !!state && !state.locked && state.hasPin && state.engine === 'ready'
  const where = useRef({ page, filesDir })
  where.current = { page, filesDir }

  useEffect(() => {
    const off = tether.onState(setState)
    const offGo = tether.onGo(setPage)
    void tether.getState().then(setState)
    return () => { off(); offGo() }
  }, [])

  useEffect(() => {
    if (state) setIgnored((prev) => prev.filter((sn) => state.unknown.some((u) => u.serialNo === sn)))
  }, [state?.unknown])

  // Locking closes every phone screen; don't reopen the Mirror by itself after unlock.
  useEffect(() => { if (state?.locked) { setPage('home'); setApks([]); setRecordAsked(false) } }, [state?.locked])
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
  return (
    <Shell state={state} page={page} go={setPage} compact={false} dock={null} badges={null} info={null}>
      <div className="pane">
        <Banners state={state} ignored={ignored} ignore={(sn) => setIgnored((p) => [...p, sn])} go={setPage} />
        <div className="pane-content">
          {page === 'home' && <Home state={state} go={setPage} record={() => { setRecordAsked(true); setPage('mirror') }} />}
          {page === 'mirror' && <Mirror state={state} recordAsked={recordAsked} clearRecordAsk={() => setRecordAsked(false)} />}
          {page === 'apps' && <Apps state={state} />}
          {page === 'files' && <Files state={state} dir={filesDir} setDir={(d) => setFilesDir(d.endsWith('/') ? d : `${d}/`)} />}
          {page === 'clipboard' && <Clipboard state={state} />}
          {page === 'notifications' && <Notifications state={state} />}
          {page === 'pilot' && <Pilot state={state} />}
          {page === 'layouts' && <Layouts state={state} />}
          {page === 'security' && <Security state={state} />}
        </div>
        <Toasts toast={toast && page !== 'files' ? fileToast(toast) : null} apks={apks} installReady={ready && !state.fileOp.busy}
          install={() => { void tether.installApk(apks[0]); setApks((a) => a.slice(1)) }} cancel={() => setApks((a) => a.slice(1))} />
      </div>
      {dragging && <DropOverlay ready={ready} where={friendlyPath(page === 'files' ? filesDir : DOWNLOAD)} />}
      {ready && page !== 'mirror' && state.pilot.current?.status === 'running' && (
        <PilotPip ai={state.pilot.current} open={() => setPage('mirror')} />
      )}
      {state.pilot.question && <PilotAsk q={state.pilot.question} />}
    </Shell>
  )
}
