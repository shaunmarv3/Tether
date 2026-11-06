import { useState } from 'react'
import type { AppState, Layout } from '../../shared/api'
import { tether } from '../tether'
import { EmptyState, Kbd, TONES } from '../ui'

// The layout's windows drawn into a w×h frame, placed like on the screen's work area (Home 64×40, Layouts 150×92).
export function LayoutDrawing({ layout, w, h }: { layout: Layout; w: number; h: number }) {
  const s = window.screen as Screen & { availLeft?: number; availTop?: number }
  const big = w >= 100
  const pad = Math.round(h / 10), iw = w - 2 * pad, ih = h - 2 * pad
  const fit = (v: number, of: number) => Math.min(1, Math.max(0, v / of))
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="layout-drawing">
      <rect x="1" y="1" width={w - 2} height={h - 2} rx={big ? 8 : 4} fill={big ? 'var(--chrome)' : 'none'} stroke={big ? 'var(--control-line)' : '#7A4A30'} />
      {layout.windows.map((win, j) => {
        const b = win.bounds
        const x = pad + fit(b.x - (s.availLeft ?? 0), s.availWidth) * iw, y = pad + fit(b.y - (s.availTop ?? 0), s.availHeight) * ih
        return <rect key={win.pkg} x={x} y={y} width={Math.max(3, fit(b.width, s.availWidth) * iw - 2)}
          height={Math.max(3, fit(b.height, s.availHeight) * ih)} rx={big ? 5 : 2} fill={TONES[j % TONES.length][0]} />
      })}
    </svg>
  )
}

export function Layouts({ state }: { state: AppState }) {
  const [naming, setNaming] = useState<string | null>(null) // new layout name while the form is open
  const [editing, setEditing] = useState<number | null>(null)
  const ready = state.device?.state === 'device'
  const openApps = state.openViews.filter((v) => v.startsWith('app:')).length
  const running = (l: Layout) => l.windows.every((w) => state.openViews.includes(`app:${w.pkg}`))
  const full = state.layouts.length >= 9

  const save = () => {
    if (!naming?.trim() || !openApps) return
    void tether.saveLayout(naming.trim(), null)
    setNaming(null)
  }

  return (
    <div className="page">
      <div className="pane-toolbar" role="toolbar" aria-label="Layouts">
        <h1>Layouts</h1>
        <span className="hint">Saved window spots. One shortcut opens them all.</span>
        <span className="spacer" />
        <button className="btn primary mid" disabled={full || naming !== null} onClick={() => setNaming(`Layout ${state.layouts.length + 1}`)}>
          New layout
        </button>
      </div>

      <div className="pane-scroll">
        {!state.layouts.length && naming === null && (
          <EmptyState title="No layouts yet" note="Open your app windows, arrange them, then save them as a layout." />
        )}
        <div className="row-list">
          {state.layouts.map((l, i) => (
            <div key={i} className="row layout-row">
              <LayoutDrawing layout={l} w={150} h={92} />
              <div className="grow">
                <div className="layout-title">
                  <h2 className="ellipsis">{l.name}</h2>{running(l) && <span className="layout-live">Running</span>}
                </div>
                <div className="soft ellipsis">{l.windows.map((w) => w.name).join(' · ')}</div>
                <div className="layout-keys"><Kbd keys={['Ctrl', 'Alt', String(i + 1)]} /></div>
                {editing === i && <div className="muted small-print layout-note">Update saves the app windows open now.</div>}
              </div>
              {editing === i ? (
                <>
                  <button className="btn" disabled={!openApps} onClick={() => { void tether.saveLayout(l.name, i); setEditing(null) }}>Update</button>
                  <button className="btn danger" onClick={() => { void tether.deleteLayout(i); setEditing(null) }}>Delete</button>
                  <button className="btn" onClick={() => setEditing(null)}>Done</button>
                </>
              ) : (
                <>
                  <button className="btn primary" disabled={!ready} onClick={() => void tether.launchLayout(i)}>Launch</button>
                  <button className="btn" onClick={() => setEditing(i)}>Edit</button>
                </>
              )}
            </div>
          ))}
        </div>

        {naming !== null && (
          <form className="layout-form" onSubmit={(e) => { e.preventDefault(); save() }}>
            <label htmlFor="ly-name" className="layout-form-label">New layout</label>
            <input id="ly-name" className="field" autoFocus maxLength={40} value={naming} onChange={(e) => setNaming(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') setNaming(null) }} />
            <span className="layout-form-note">
              {openApps ? `Saves the ${openApps} app window${openApps === 1 ? '' : 's'} open now, right where they are.` : 'Open some app windows first.'}
            </span>
            <button type="submit" className="btn primary" disabled={!openApps || !naming.trim()}>Save</button>
            <button type="button" className="btn" onClick={() => setNaming(null)}>Cancel</button>
          </form>
        )}
      </div>
    </div>
  )
}
