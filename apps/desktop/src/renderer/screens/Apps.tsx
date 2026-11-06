import { useEffect, useState } from 'react'
import type { PhoneApp } from '@tether/core'
import { DEFAULT_APP_OPTIONS, type AppOptions, type AppState, type Shape } from '../../shared/api'
import { sentence } from '../text'
import { useIcons } from '../icons'
import { tether } from '../tether'
import { EmptyState, Segmented, Switch, Tile, toneOf } from '../ui'

type Filter = 'all' | 'open' | 'pinned'
const SHAPES: [Shape, string, string][] = [
  ['phone', 'Phone', 'Same shape as your phone'],
  ['tablet', 'Tablet', '1920 × 1200 · 240 dpi'],
  ['free', 'Free', 'Resizes with the window'],
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
  const openCount = (apps ?? []).filter((a) => isOpen(a.pkg)).length
  const icons = useIcons((apps ?? []).map((a) => a.pkg), !!serial)

  return (
    <div className="page">
      <div className="pane-toolbar" role="toolbar" aria-label="Apps">
        <h1>Apps</h1>
        <span className="hint">{apps ? `${apps.length} on the phone · ${openCount} open` : 'Every app in its own window'}</span>
        <span className="spacer" />
        <Segmented label="Filter" value={filter} set={setFilter} options={[['all', 'All'], ['open', 'Open'], ['pinned', 'Pinned']]} />
        <label className="sr" htmlFor="apps-q">Find an app</label>
        <input id="apps-q" className="field apps-search" type="search" placeholder="Find an app" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {!serial ? <EmptyState title="No phone" note="Plug in a USB cable" kind="phone" />
        : error ? <EmptyState title="Couldn't read apps" note={sentence(error)} />
        : !apps ? <EmptyState title="Reading apps…" kind="loading" boxed />
        : (
          <div className="pane-body">
            <section className="pane-scroll apps-grid-wrap" aria-label="All apps">
              {shown.length ? (
                <div className="apps-grid">
                  {shown.map((a) => (
                    <button key={a.pkg} className="apps-tile" aria-pressed={app?.pkg === a.pkg} title={a.name}
                      onClick={() => setSelected(a.pkg)} onDoubleClick={() => void tether.openApp(a.pkg, a.name)}>
                      <Tile name={a.name} tone={toneOf(a.pkg, state.pins)} icon={icons.get(a.pkg)} />
                      <span className="ellipsis apps-name">{a.name}</span>
                      {isOpen(a.pkg) && <span className="apps-dot" aria-label="open" />}
                    </button>
                  ))}
                </div>
              ) : <EmptyState title={filter === 'open' ? 'No app windows open' : filter === 'pinned' ? 'Nothing pinned yet' : 'No app matches'} />}
            </section>
            {app && <AppPanel app={app} state={state} open={isOpen(app.pkg)} pinned={isPinned(app.pkg)} icon={icons.get(app.pkg)} />}
          </div>
        )}
    </div>
  )
}

function AppPanel({ app, state, open, pinned, icon }: { app: PhoneApp; state: AppState; open: boolean; pinned: boolean; icon?: string }) {
  const opts = state.appOptions[app.pkg] ?? DEFAULT_APP_OPTIONS
  const set = (patch: Partial<AppOptions>) => void tether.setAppOptions(app.pkg, { ...opts, ...patch })
  const full = !pinned && state.pins.length >= 8

  return (
    <aside className="inspector" aria-labelledby="sel-h">
      <div className="apps-head">
        <Tile name={app.name} tone={toneOf(app.pkg, state.pins)} icon={icon} size={48} radius={14} font={22} />
        <div className="grow">
          <h2 id="sel-h" className="inspector-title ellipsis">{app.name}</h2>
          <div className="mono apps-pkg ellipsis">{app.pkg}</div>
        </div>
      </div>
      <div>
        <div className="section-title apps-label">Window shape</div>
        <Segmented label="Window shape" full value={opts.shape} set={(shape) => set({ shape })} options={SHAPES.map(([s, l]) => [s, l])} />
        <div className="apps-note">{open ? 'Changes apply next time you open it' : SHAPES.find((s) => s[0] === opts.shape)![2]}</div>
      </div>
      <div>
        {TOGGLES.map(([k, label]) => (
          <div key={k} className="switch-row">{label}<Switch label={label} on={opts[k]} set={(on) => set({ [k]: on })} /></div>
        ))}
      </div>
      <span className="spacer" />
      <div className="apps-actions">
        <button className="btn primary big grow" onClick={() => void tether.openApp(app.pkg, app.name)}>{open ? 'Focus window' : 'Open window'}</button>
        <button className="btn big" disabled={full} onClick={() => void (pinned ? tether.unpin(app.pkg) : tether.pin(app.pkg, app.name))}>
          {pinned ? 'Unpin' : full ? 'Channels full' : 'Pin'}
        </button>
      </div>
    </aside>
  )
}
