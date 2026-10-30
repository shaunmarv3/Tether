import { useState } from 'react'
import type { AppState, Layout } from '../../shared/api'
import { tether } from '../tether'
import { TINTS } from './Home'

// Window spots as % of the screen's work area, for the little preview.
function spot(b: Layout['windows'][number]['bounds']) {
  const s = window.screen as Screen & { availLeft?: number; availTop?: number }
  const pct = (v: number, of: number) => `${Math.min(100, Math.max(0, (v / of) * 100))}%`
  return {
    left: pct(b.x - (s.availLeft ?? 0), s.availWidth), top: pct(b.y - (s.availTop ?? 0), s.availHeight),
    width: pct(b.width, s.availWidth), height: pct(b.height, s.availHeight),
  }
}

export function Layouts({ state }: { state: AppState }) {
  const [naming, setNaming] = useState<string | null>(null) // new layout name while the form is open
  const [editing, setEditing] = useState<number | null>(null)
  const ready = state.device?.state === 'device'
  const openApps = state.openViews.filter((v) => v.startsWith('app:')).length
  const running = (l: Layout) => l.windows.every((w) => state.openViews.includes(`app:${w.pkg}`))
  const live = state.layouts.find(running)
  const full = state.layouts.length >= 9

  const save = () => {
    if (!naming?.trim()) return
    void tether.saveLayout(naming.trim(), null)
    setNaming(null)
  }

  return (
    <main className="main">
      <header className="row between wrap end">
        <div className="col">
          <span className="mono tiny muted">{state.layouts.length} LAYOUT{state.layouts.length === 1 ? '' : 'S'} · SAVED WINDOW SPOTS</span>
          <h1 className="headline">One key, <span className="accent-text">a whole desk.</span></h1>
        </div>
        <button className="key accent tall" disabled={full || naming !== null} onClick={() => setNaming(`Layout ${state.layouts.length + 1}`)}>+ NEW LAYOUT</button>
      </header>

      <div className="cards">
        {state.layouts.map((l, i) => (
          <section key={i} className="card layout-card" aria-labelledby={`lay-${i}`}>
            <div className="layout-preview" aria-hidden="true">
              {l.windows.map((w, j) => (
                <div key={w.pkg} className="spot" style={spot(w.bounds)}>
                  <span className="spot-letter" style={{ color: TINTS[j % 4] }}>{w.name.charAt(0).toUpperCase()}</span>
                  <span className="spot-name mono">{w.name.toUpperCase()}</span>
                </div>
              ))}
            </div>
            <div className="row between top">
              <div className="col tight">
                <h2 id={`lay-${i}`} className="panel-title">{l.name}</h2>
                <span className="muted small-note">{l.windows.map((w) => w.name).join(' · ')}</span>
              </div>
              <span className="row kbds"><kbd>CTRL</kbd><kbd>ALT</kbd><kbd>{i + 1}</kbd></span>
            </div>
            {editing === i ? (
              <div className="row">
                <button className="key grow-key" disabled={!openApps} onClick={() => { void tether.saveLayout(l.name, i); setEditing(null) }}>UPDATE</button>
                <button className="key danger" onClick={() => { void tether.deleteLayout(i); setEditing(null) }}>DELETE</button>
                <button className="key" onClick={() => setEditing(null)}>DONE</button>
              </div>
            ) : (
              <div className="row">
                <button className="key grow-key" disabled={!ready} onClick={() => void tether.launchLayout(i)}>
                  <span className={`led ${running(l) ? 'on' : ''}`} />LAUNCH
                </button>
                <button className="key" onClick={() => setEditing(i)}>EDIT</button>
              </div>
            )}
            {editing === i && <span className="mono tiny muted">UPDATE SAVES THE APP WINDOWS OPEN NOW</span>}
          </section>
        ))}

        {!full && (naming === null ? (
          <button className="new-layout" onClick={() => setNaming(`Layout ${state.layouts.length + 1}`)}>
            <span className="new-layout-title">+ NEW LAYOUT</span>
            <span className="muted small-note">Open your apps, arrange them, save.</span>
          </button>
        ) : (
          <section className="card layout-card new-form">
            <label className="col">
              <span className="mono tiny muted">NAME</span>
              <input className="field name-field" autoFocus maxLength={40} value={naming}
                onChange={(e) => setNaming(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save() }} />
            </label>
            <span className="mono tiny muted">
              {openApps ? `SAVES ${openApps} OPEN APP WINDOW${openApps === 1 ? '' : 'S'} WHERE THEY ARE NOW` : 'OPEN SOME APP WINDOWS FIRST'}
            </span>
            <div className="row">
              <button className="key accent grow-key" disabled={!openApps || !naming.trim()} onClick={save}>SAVE</button>
              <button className="key" onClick={() => setNaming(null)}>CANCEL</button>
            </div>
          </section>
        ))}
      </div>

      {live && <div className="lcd ticker">› {live.name.toUpperCase()} RUNNING · {live.windows.length} WINDOW{live.windows.length === 1 ? '' : 'S'}</div>}
    </main>
  )
}
