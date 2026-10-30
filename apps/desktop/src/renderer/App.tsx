import { useEffect, useState } from 'react'
import type { AppState } from '../shared/api'
import { playPhoneAudio } from './audio'
import { Apps } from './screens/Apps'
import { Engine } from './screens/Engine'
import { Home } from './screens/Home'
import { Layouts } from './screens/Layouts'
import { Lock } from './screens/Lock'
import { Mirror } from './screens/Mirror'
import { Security } from './screens/Security'
import { Sidebar, type Page } from './Sidebar'
import { tether } from './tether'

export function App() {
  const [state, setState] = useState<AppState | null>(null)
  const [page, setPage] = useState<Page>('home')
  const [ignored, setIgnored] = useState<string[]>([]) // unknown phones hidden until they reconnect
  const open = !!state && !state.locked && state.hasPin && state.engine === 'ready'

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
  useEffect(() => { if (state?.locked) setPage('home') }, [state?.locked])
  useEffect(() => (open ? playPhoneAudio() : undefined), [open])

  if (!state) return null
  if (state.locked || !state.hasPin) return <Lock state={state} />
  if (state.engine !== 'ready') return <Engine state={state} />
  return (
    <div className="shell">
      <Sidebar state={state} page={page} go={setPage} />
      {page === 'home' && <Home state={state} go={setPage} ignored={ignored} ignore={(sn) => setIgnored((p) => [...p, sn])} />}
      {page === 'mirror' && <Mirror state={state} />}
      {page === 'apps' && <Apps state={state} />}
      {page === 'layouts' && <Layouts state={state} />}
      {page === 'security' && <Security state={state} />}
    </div>
  )
}
