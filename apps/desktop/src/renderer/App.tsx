import { useEffect, useState } from 'react'
import type { AppState } from '../shared/api'
import { Engine } from './screens/Engine'
import { Home } from './screens/Home'
import { Lock } from './screens/Lock'
import { Security } from './screens/Security'
import { Sidebar, type Page } from './Sidebar'
import { tether } from './tether'

export function App() {
  const [state, setState] = useState<AppState | null>(null)
  const [page, setPage] = useState<Page>('home')
  const [ignored, setIgnored] = useState<string[]>([]) // unknown phones hidden until they reconnect

  useEffect(() => {
    const off = tether.onState(setState)
    void tether.getState().then(setState)
    return off
  }, [])

  useEffect(() => {
    if (state) setIgnored((prev) => prev.filter((sn) => state.unknown.some((u) => u.serialNo === sn)))
  }, [state?.unknown])

  if (!state) return null
  if (state.locked || !state.hasPin) return <Lock state={state} />
  if (state.engine !== 'ready') return <Engine state={state} />
  return (
    <div className="shell">
      <Sidebar state={state} page={page} go={setPage} />
      {page === 'home'
        ? <Home state={state} ignored={ignored} ignore={(sn) => setIgnored((p) => [...p, sn])} />
        : <Security state={state} />}
    </div>
  )
}
