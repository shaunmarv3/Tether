import type { AppState, Clip, NotificationItem } from '../../shared/api'
import type { Page } from '../Shell'
import { tether } from '../tether'
import { EmptyState, Kbd, Tile, TONES } from '../ui'
import { useNow, wipeLeft } from './Clipboard'
import { LayoutDrawing } from './Layouts'
import { useNotifications } from './Notifications'


const greeting = (h: number) => (h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening')
const today = (d: Date) =>
  `${d.toLocaleDateString('en-GB', { weekday: 'long' })}, ${d.getDate()} ${d.toLocaleDateString('en-GB', { month: 'long' })}`
const hhmm = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

function phoneLine(state: AppState): string {
  const d = state.device
  if (!d) return state.unknown.length ? 'A new phone is plugged in. Trust it to connect.' : 'No phone yet. Plug one in with a USB cable.'
  if (d.state === 'unauthorized') return 'Check your phone: tap Allow on “Allow USB debugging?”'
  if (d.state !== 'device') return 'The phone is offline. Replug the cable.'
  const name = state.status?.model ?? d.name ?? 'Your phone'
  return state.status ? `${name} is connected by ${d.transport === 'usb' ? 'USB' : 'Wi-Fi'} and ready.` : `Reading ${name}…`
}

function clipMeta(c: Clip, now: number): string {
  if (c.wipeAt) return `Wipes in ${wipeLeft(c, now)} s`
  if (c.note === 'WIPED') return 'Wiped'
  const min = Math.max(0, Math.round((now - Date.parse(c.at)) / 60000))
  return `From ${c.dir === 'phone' ? 'phone' : 'PC'} · ${min < 60 ? `${min} min` : `${Math.floor(min / 60)} h`}`
}
const notifText = (n: NotificationItem) => (n.code ? 'One-time code, hidden' : n.title ? `${n.title}: ${n.text}` : n.text)
const TILT = ['-1deg', '0.8deg', '-0.4deg']

function Stat({ value, label }: { value: string; label: string }) {
  return <div><div className="home-stat">{value}</div><div className="home-stat-label">{label}</div></div>
}

export function Home({ state, go }: { state: AppState; go: (p: Page) => void }) {
  const now = useNow()
  const { list } = useNotifications(state)
  const { status } = state
  const ready = state.device?.state === 'device'
  const d = new Date(now)
  const pct = status?.batteryPct ?? null
  const free = status?.storageTotalGb != null && status.storageUsedGb != null ? Math.max(0, status.storageTotalGb - status.storageUsedGb) : null
  const ring = 2 * Math.PI * 23

  return (
    <div className="home">
      <header className="home-hero">
        <div>
          <div className="mono home-date">{today(d)}</div>
          <h1 className="home-greeting">{greeting(d.getHours())}</h1>
          <p className="home-line">{phoneLine(state)}</p>
        </div>
        {ready && status && (
          <div className="home-stats">
            <div className="home-battery">
              <svg width="54" height="54" viewBox="0 0 54 54" role="img" aria-label={`Battery ${pct ?? 'unknown'} percent`}>
                <circle cx="27" cy="27" r="23" fill="none" stroke="var(--control-line)" strokeWidth="5" />
                <circle cx="27" cy="27" r="23" fill="none" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round"
                  strokeDasharray={`${((pct ?? 0) / 100) * ring} ${ring}`} transform="rotate(-90 27 27)" />
              </svg>
              <Stat value={pct == null ? '—' : `${pct}%`} label="Battery" />
            </div>
            <Stat value={free == null ? '—' : `${Math.round(free)} GB`} label="Free storage" />
            <Stat value={`${status.latencyMs} ms`} label="Lag" />
          </div>
        )}
      </header>

      <section className="home-apps" aria-labelledby="h-apps">
        <div className="home-head">
          <h2 id="h-apps">Your apps <span className="home-sub">each opens in its own window</span></h2>
          <button className="link-btn" onClick={() => go('apps')}>Pin more</button>
        </div>
        {state.pins.length ? (
          <div className="home-launcher">
            {state.pins.map((p, i) => {
              const open = state.openViews.includes(`app:${p.pkg}`)
              return (
                <button key={p.pkg} className="home-app" disabled={!ready} title={open ? `${p.name} · open` : p.name}
                  onClick={() => void tether.openApp(p.pkg, p.name)}>
                  <Tile name={p.name} tone={TONES[i % TONES.length]} size={54} radius={16} font={24} className="home-tile" />
                  <span className="ellipsis home-app-name">{p.name}</span>
                  {open && <span className="home-open-dot" aria-label="open" />}
                </button>
              )
            })}
          </div>
        ) : <EmptyState title="No pins yet" note={<>Pin apps from <button className="link-btn" onClick={() => go('apps')}>Apps</button></>} />}
      </section>

      <div className="home-cols">
        <section aria-labelledby="h-not" className="home-col">
          <h2 id="h-not">On your phone</h2>
          {!ready ? <EmptyState title="No phone" note="Plug in a USB cable" />
            : !list ? <EmptyState title="Reading the shade…" kind="loading" />
            : !list.length ? <EmptyState title="Nothing in the shade" />
            : list.slice(0, 3).map((n) => (
              <button key={n.key} className="home-bubble" onClick={() => go('notifications')}>
                <span className="home-bubble-head"><span className="home-bubble-app">{n.app}</span><span className="mono muted">{hhmm(n.postedAt)}</span></span>
                <span className="ellipsis home-bubble-text">{notifText(n)}</span>
              </button>
            ))}
        </section>

        <section aria-labelledby="h-clip" className="home-col">
          <div className="home-head"><h2 id="h-clip">Clipboard</h2><span className="home-sub">Sync {state.clipSettings.sync ? 'on' : 'off'}</span></div>
          {!state.clips.length ? <EmptyState title="Nothing copied yet" note="Copy on either side and it shows here" />
            : state.clips.slice(0, 3).map((c, i) => (
              <div key={c.id} className={`home-slip${c.note === 'WIPED' ? ' wiped' : ''}`} style={{ transform: `rotate(${TILT[i]})` }}>
                <div className="ellipsis home-slip-text">{c.secret ? 'Code hidden' : c.text}</div>
                <div className="mono home-slip-meta">{clipMeta(c, now)}</div>
              </div>
            ))}
        </section>

        <section aria-labelledby="h-lay" className="home-col">
          <h2 id="h-lay">Layouts</h2>
          {!state.layouts.length ? <EmptyState title="No layouts yet" note="Save your app windows on the Layouts page" />
            : state.layouts.map((l, i) => (
              <button key={i} className="home-layout" disabled={!ready} onClick={() => void tether.launchLayout(i)}>
                <LayoutDrawing layout={l} w={64} h={40} />
                <span className="grow"><span className="home-layout-name ellipsis">{l.name}</span><Kbd keys={['Ctrl', 'Alt', String(i + 1)]} /></span>
              </button>
            ))}
        </section>
      </div>
    </div>
  )
}
