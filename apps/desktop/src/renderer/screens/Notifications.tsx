import { useEffect, useState } from 'react'
import type { AppState, NotificationItem } from '../../shared/api'
import { tether } from '../tether'
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

// The phone's notification shade, read over adb. CLEAR removes one from the phone (no undo, like a swipe).
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
  const line = !ready ? 'NO PHONE · PLUG IN A USB CABLE' : !list ? 'READING THE SHADE…'
    : `${list.length} IN THE SHADE · LIVE`

  return (
    <main className="main">
      <header className="col">
        <span className="mono small muted">{line}</span>
        <h1 className="headline">Your phone's shade, <span className="accent-text">on the PC.</span></h1>
      </header>

      <div className="clip-layout">
        <section className="clip-history" aria-labelledby="notif-h">
          <h2 id="notif-h" className="clip-head">NOTIFICATIONS · NOW</h2>
          {list && !list.length && <div className="files-empty mono small muted">NOTHING IN THE SHADE</div>}
          {list?.map((n) => (
            <div key={n.key} className={`clip-row ${n.key === picked ? 'picked' : ''} ${n.code ? 'secret' : ''}`}>
              <button className="notif-open" aria-pressed={n.key === picked} onClick={() => setPicked(n.key)}>
                <span className="row notif-meta">
                  <span className="dir-chip mono">{n.app.toUpperCase()}</span>
                  <span className="mono tiny muted">{ago(when(n), now)}</span>
                </span>
                {n.title && <span className="notif-title">{n.title}</span>}
                <span className="clip-text muted">{n.code ? '●●●●●● ONE-TIME CODE' : n.text}</span>
              </button>
              {n.clearable && <button className="small-key" onClick={() => clear(n.key)}>CLEAR</button>}
            </div>
          ))}
          {error && <div className="files-empty mono small danger-text" role="alert">{error}</div>}
        </section>

        <aside className="clip-side">
          <section className="card notif-detail" aria-live="polite">
            {shown ? (
              <>
                <span className="row between">
                  <span className="dir-chip mono">{shown.app.toUpperCase()}</span>
                  <span className="mono tiny muted">{ago(when(shown), now)}</span>
                </span>
                {shown.title && <h2 className="card-title">{shown.title}</h2>}
                <p className="notif-full">{shown.fullText || 'NO TEXT'}</p>
                {shown.clearable
                  ? <button className="key danger" onClick={() => clear(shown.key)}>CLEAR FROM PHONE</button>
                  : <span className="mono tiny muted">THE PHONE KEEPS THIS ONE · NO CLEAR</span>}
              </>
            ) : (
              <>
                <h2 className="card-head">FULL MESSAGE</h2>
                <p className="card-note">Click a notification to read all of it. Long texts end at 512 characters: that is all the phone hands over.</p>
              </>
            )}
          </section>
        </aside>
      </div>
    </main>
  )
}
