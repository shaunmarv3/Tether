import { useEffect, useState } from 'react'
import type { AppState, NotificationItem } from '../../shared/api'
import { sentence } from '../text'
import { tether } from '../tether'
import { EmptyState, Tile, toneOf } from '../ui'
import { ago, useNow } from './Clipboard'
import { errText } from './Files'

const POLL_MS = 4000 // only while a page that shows them is open (Home, Notifications)
const when = (n: NotificationItem) => new Date(n.postedAt).toISOString()

// The phone's shade, read every few seconds. null = not read yet (or no phone).
export function useNotifications(state: AppState): { list: NotificationItem[] | null; setList: (f: (l: NotificationItem[] | null) => NotificationItem[] | null) => void; error: string | null; setError: (e: string | null) => void } {
  const ready = state.device?.state === 'device'
  const [list, setList] = useState<NotificationItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setList(null)
    if (!ready) return
    let alive = true
    const load = () => tether.listNotifications().then(
      (l) => { if (alive) { setList(l); setError(null) } },
      (err) => { if (alive) setError(errText(err)) },
    )
    void load()
    const t = setInterval(() => void load(), POLL_MS)
    return () => { alive = false; clearInterval(t) }
  }, [ready, state.device?.serial])
  return { list, setList, error, setError }
}

// The phone's notification shade, read over adb. Clear removes one from the phone (no undo, like a swipe).
export function Notifications({ state }: { state: AppState }) {
  const now = useNow()
  const ready = state.device?.state === 'device'
  const { list, setList, error, setError } = useNotifications(state)
  const [picked, setPicked] = useState<string | null>(null)

  function clear(key: string) {
    setList((l) => l?.filter((n) => n.key !== key) ?? null)
    if (picked === key) setPicked(null)
    tether.clearNotification(key).catch((err) => setError(errText(err)))
  }

  const shown = list?.find((n) => n.key === picked) ?? null
  const hint = !ready ? 'No phone' : !list ? 'Reading the shade…' : `${list.length} in the phone's shade, updated live`

  return (
    <div className="page">
      <div className="pane-toolbar" role="toolbar" aria-label="Notifications">
        <h1>Notifications</h1>
        <span className="hint">{hint}</span>
      </div>

      {!ready ? <EmptyState title="No phone" note="Plug in a USB cable" kind="phone" /> : (
        <div className="pane-body">
          <section className="pane-scroll" aria-label="In the shade now">
            {!list ? <EmptyState title="Reading the shade…" kind="loading" boxed />
              : !list.length && <EmptyState title="Nothing in the shade" />}
            <div className="row-list">
              {list?.map((n) => (
                <div key={n.key} className="row notif-row" aria-selected={n.key === picked}>
                  <Tile name={n.app} tone={toneOf(n.pkg, state.pins)} size={32} radius={10} font={14} />
                  <button className="notif-open grow" aria-pressed={n.key === picked} onClick={() => setPicked(n.key)}>
                    <span className="notif-meta"><span className="notif-app">{n.app}</span><span className="mono muted">{ago(when(n), now)}</span></span>
                    {n.title && <span className="notif-title">{n.title}</span>}
                    <span className="ellipsis notif-text">{n.code ? 'One-time code, hidden' : n.text}</span>
                  </button>
                  {n.clearable && <button className="btn small" onClick={() => clear(n.key)}>Clear</button>}
                </div>
              ))}
            </div>
            {error && <div className="error-text page-error" role="alert">{sentence(error)}</div>}
          </section>

          <aside className="inspector notif-panel" aria-label="Full message" aria-live="polite">
            {shown ? (
              <>
                <div className="notif-meta"><span className="notif-app">{shown.app}</span><span className="mono muted">{ago(when(shown), now)}</span></div>
                {shown.title && <h2 className="notif-big-title">{shown.title}</h2>}
                <p className="notif-full">{shown.fullText || 'No text'}</p>
                <span className="spacer" />
                <p className="muted small-print">Long messages end at 512 characters, that is all the phone hands over.</p>
                {shown.clearable
                  ? <button className="btn danger big" onClick={() => clear(shown.key)}>Clear from phone</button>
                  : <p className="muted small-print">The phone keeps this one: it can't be cleared.</p>}
              </>
            ) : (
              <EmptyState title="Full message" note="Click a notification to read all of it. Long messages end at 512 characters, that is all the phone hands over." />
            )}
          </aside>
        </div>
      )}
    </div>
  )
}
