import { useState } from 'react'
import type { AppState } from '../../shared/api'
import { PhoneView, type ViewInfo } from '../PhoneView'

export function Mirror({ state }: { state: AppState }) {
  const [info, setInfo] = useState<ViewInfo | null>(null)
  const ready = state.device?.state === 'device'

  return (
    <main className="main mirror-page">
      <header className="col">
        <span className="mono tiny muted">{info ? `LIVE · ${info.width}×${info.height} · ${info.fps} FPS` : 'PHONE SCREEN'}</span>
        <h1 className="headline">Your phone, <span className="accent-text">right here.</span></h1>
      </header>
      {ready
        ? <PhoneView view="mirror" keys onInfo={setInfo} />
        : <section className="lcd status"><div className="lcd-title">NO PHONE · PLUG IN A USB CABLE</div></section>}
    </main>
  )
}
