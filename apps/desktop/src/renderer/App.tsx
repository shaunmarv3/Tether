import { useEffect, useState } from 'react'
import type { AppState } from '../shared/api'
import { Engine } from './screens/Engine'
import { Home } from './screens/Home'
import { Lock } from './screens/Lock'
import { tether } from './tether'

export function App() {
  const [state, setState] = useState<AppState | null>(null)

  useEffect(() => {
    const off = tether.onState(setState)
    void tether.getState().then(setState)
    return off
  }, [])

  if (!state) return null
  if (state.locked || !state.hasPin) return <Lock state={state} />
  if (state.engine !== 'ready') return <Engine state={state} />
  return <Home state={state} />
}
