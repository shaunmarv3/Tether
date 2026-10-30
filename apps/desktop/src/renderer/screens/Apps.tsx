import { useEffect, useState } from 'react'
import type { PhoneApp } from '@tether/core'
import { DEFAULT_APP_OPTIONS, type AppOptions, type AppState, type Shape } from '../../shared/api'
import { tether } from '../tether'
import { TINTS } from './Home'

type Filter = 'all' | 'open' | 'pinned'
const SHAPES: [Shape, string, string][] = [
  ['phone', 'PHONE', 'SAME SHAPE AS YOUR PHONE'],
  ['tablet', 'TABLET', '1920×1200 · 240 DPI'],
  ['free', 'FREE', 'RESIZES WITH THE WINDOW'],
]
const TOGGLES: [keyof Omit<AppOptions, 'shape'>, string][] = [
  ['keepRunning', 'Keep running when closed'],
  ['pcKeyboard', 'Type with PC keyboard'],
  ['hideStatusBar', 'Hide phone status bar'],
  ['onTop', 'Always on top'],
]

export function Apps({ state }: { state: AppState }) {
  const [apps, setApps] = useState<PhoneApp[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const serial = state.device?.state === 'device' ? state.device.serial : null

  useEffect(() => {
    setApps(null)
    setError(null)
    if (!serial) return
    tether.listApps().then(setApps, (err: Error) => setError(err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')))
  }, [serial])

  const isOpen = (pkg: string) => state.openViews.includes(`app:${pkg}`)
  const isPinned = (pkg: string) => state.pins.some((p) => p.pkg === pkg)
  const q = query.trim().toLowerCase()
  const shown = (apps ?? []).filter((a) =>
    (filter === 'all' || (filter === 'open' ? isOpen(a.pkg) : isPinned(a.pkg))) &&
    (!q || a.name.toLowerCase().includes(q) || a.pkg.includes(q)))
  const app = apps?.find((a) => a.pkg === selected) ?? shown[0] ?? null
  const tint = (pkg: string) => TINTS[Math.max(0, apps?.findIndex((a) => a.pkg === pkg) ?? 0) % 4]
  const openCount = (apps ?? []).filter((a) => isOpen(a.pkg)).length

  return (
    <main className="main">
      <header className="row between wrap end">
        <div className="col">
          <span className="mono tiny muted">{apps ? `${apps.length} APPS ON PHONE · ${openCount} OPEN` : 'APPS'}</span>
          <h1 className="headline">Every app, <span className="accent-text">its own window.</span></h1>
        </div>
        <div className="row wrap">
          <div className="filter" role="group" aria-label="Filter">
            {(['all', 'open', 'pinned'] as Filter[]).map((f) => (
              <button key={f} aria-pressed={filter === f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>{f.toUpperCase()}</button>
            ))}
          </div>
          <label className="search">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" />
            </svg>
            <span className="sr">Find an app</span>
            <input type="search" placeholder="Find an app" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
        </div>
      </header>

      {!serial ? <section className="lcd status"><div className="lcd-title">NO PHONE · PLUG IN A USB CABLE</div></section>
        : error ? <section className="lcd status"><div className="lcd-title">COULDN'T READ APPS · {error.toUpperCase()}</div></section>
        : !apps ? <section className="lcd status"><div className="lcd-title blink">READING APPS…</div></section>
        : (
          <div className="apps-layout">
            <section className="app-grid-card" aria-label="All apps">
              {shown.length ? (
                <div className="app-grid">
                  {shown.map((a) => (
                    <button key={a.pkg} className={`pad ${app?.pkg === a.pkg ? 'selected' : ''}`} aria-pressed={app?.pkg === a.pkg}
                      onClick={() => setSelected(a.pkg)} onDoubleClick={() => void tether.openApp(a.pkg, a.name)}>
                      <span className={`led ${isOpen(a.pkg) ? 'on' : ''}`} />
                      <span className="pad-face small-face" style={{ color: tint(a.pkg) }}>{a.name.charAt(0).toUpperCase()}</span>
                      <span className="pad-name">{a.name}</span>
                    </button>
                  ))}
                </div>
              ) : <span className="mono small muted">{filter === 'open' ? 'NO APP WINDOWS OPEN' : filter === 'pinned' ? 'NOTHING PINNED YET' : 'NO APP MATCHES'}</span>}
            </section>
            {app && <AppPanel app={app} state={state} open={isOpen(app.pkg)} pinned={isPinned(app.pkg)} tint={tint(app.pkg)} />}
          </div>
        )}
    </main>
  )
}

function AppPanel({ app, state, open, pinned, tint }: { app: PhoneApp; state: AppState; open: boolean; pinned: boolean; tint: string }) {
  const opts = state.appOptions[app.pkg] ?? DEFAULT_APP_OPTIONS
  const set = (patch: Partial<AppOptions>) => void tether.setAppOptions(app.pkg, { ...opts, ...patch })
  const full = !pinned && state.pins.length >= 8

  return (
    <section className="card app-panel" aria-labelledby="sel-h">
      <div className="row panel-head">
        <span className="pad-face" style={{ color: tint }}>{app.name.charAt(0).toUpperCase()}</span>
        <div className="col tight">
          <h2 id="sel-h" className="panel-title">{app.name}</h2>
          <span className="mono tiny muted">{app.pkg.toUpperCase()}</span>
        </div>
      </div>
      <div className="lcd panel-lcd">
        <span>{open ? '● WINDOW OPEN' : '○ NO WINDOW'}</span>
        <span className="dim">{open ? 'CHANGES APPLY NEXT TIME YOU OPEN IT' : SHAPES.find((s) => s[0] === opts.shape)![2]}</span>
      </div>
      <div className="col">
        <span className="mono tiny muted">WINDOW SHAPE</span>
        <div className="segments three" role="group" aria-label="Window shape">
          {SHAPES.map(([s, label]) => (
            <button key={s} className={`segment ${opts.shape === s ? 'on' : ''}`} aria-pressed={opts.shape === s} onClick={() => set({ shape: s })}>{label}</button>
          ))}
        </div>
      </div>
      <div className="col toggles">
        {TOGGLES.map(([k, label]) => (
          <button key={k} className="setting" aria-pressed={opts[k]} onClick={() => set({ [k]: !opts[k] })}>
            {label}<span className={`switch ${opts[k] ? 'on' : ''}`} />
          </button>
        ))}
      </div>
      <div className="row">
        <button className="key accent grow-key" onClick={() => void tether.openApp(app.pkg, app.name)}>{open ? 'FOCUS WINDOW' : 'OPEN WINDOW'}</button>
        <button className="key" disabled={full} onClick={() => void (pinned ? tether.unpin(app.pkg) : tether.pin(app.pkg, app.name))}>
          {pinned ? 'UNPIN' : full ? 'CHANNELS FULL' : 'PIN'}
        </button>
      </div>
    </section>
  )
}
