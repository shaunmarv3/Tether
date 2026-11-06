import { useEffect, useState, type ReactNode } from 'react'
import type { AppState } from '../../shared/api'
import type { Page } from '../Shell'
import { tether } from '../tether'
import { DIR_LABEL, linkLine, useNow, wipeLeft } from './Clipboard'
import { errText } from './Files'

export const TINTS = ['#FFB59E', '#C7B8FF', '#8FE3D0', '#FFE07A']

function today(): string {
  const d = new Date()
  const weekday = d.toLocaleDateString('en-GB', { weekday: 'long' })
  const month = d.toLocaleDateString('en-GB', { month: 'short' })
  return `${weekday} · ${d.getDate()} ${month}`.toUpperCase()
}

function lcdMessage(state: AppState): string | null {
  const d = state.device
  if (!d) return state.unknown.length ? 'NEW PHONE · TRUST IT TO CONNECT' : 'NO PHONE · PLUG IN A USB CABLE'
  if (d.state === 'unauthorized') return "ACCEPT 'ALLOW USB DEBUGGING?' ON YOUR PHONE"
  if (d.state !== 'device') return 'PHONE OFFLINE · REPLUG THE CABLE'
  if (!state.status) return 'READING PHONE…'
  return null
}

function QuickKey({ icon, label, disabled, onClick }: { icon: ReactNode; label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button className="quick-key" disabled={disabled} onClick={onClick}>
      {icon}<span>{label}</span>
    </button>
  )
}

const ICONS = {
  shot: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>,
  rec: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" fill="#D7261E" stroke="#D7261E" /></svg>,
  paste: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 3h6v3H9z" /></svg>,
  off: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z" /></svg>,
}

export function Home({ state, go }: { state: AppState; go: (p: Page) => void }) {
  const now = useNow()
  const [quick, setQuick] = useState<{ text: string; error: boolean } | null>(null)
  useEffect(() => {
    if (!quick) return
    const t = setTimeout(() => setQuick(null), 4000)
    return () => clearTimeout(t)
  }, [quick])
  const act = (p: Promise<void>, done: string) => {
    setQuick(null)
    p.then(() => setQuick({ text: done, error: false }), (err) => setQuick({ text: errText(err), error: true }))
  }
  const ticker = state.clips.slice(0, 3)
  const clipLine = linkLine(state)
  const { device, status } = state
  const ready = device?.state === 'device'
  const link = device ? (device.transport === 'usb' ? 'USB' : 'WI-FI') : '—'
  const message = lcdMessage(state)
  const bars = Math.round((status?.batteryPct ?? 0) / 10)

  return (
    <main className="main">
      <header className="row between wrap">
        <div className="col">
          <span className="mono tiny muted">{today()}</span>
          <h1 className="headline">Your phone is <span className="accent-text">on the line.</span></h1>
        </div>
      </header>

      <div className="status-row">
      <section className="lcd status" aria-label="Phone status">
        {message ? (
          <div className="lcd-title">{message}</div>
        ) : status && (
          <>
            <div className="row between top wrap">
              <div className="col">
                <span className="lcd-big">{status.model.toUpperCase()}</span>
                <span className="dim small">ANDROID {status.android}{status.nothingOs && ` / NOTHING OS ${status.nothingOs}`}</span>
              </div>
            </div>
            <div className="col">
              <div className="row between small"><span>BAT</span><span>{status.batteryPct ?? '—'}%</span></div>
              <div className="bars">
                {Array.from({ length: 10 }, (_, i) => <span key={i} className={i < bars ? 'on' : ''} />)}
              </div>
            </div>
            <div className="grid3">
              <div className="col"><span className="dim tiny">LINK</span><span>{link}</span></div>
              <div className="col"><span className="dim tiny">LAG</span><span>{status.latencyMs} MS</span></div>
              <div className="col"><span className="dim tiny">STORE</span>
                <span>{status.storageUsedGb ?? '—'}/{status.storageTotalGb ?? '—'}G</span></div>
            </div>
          </>
        )}
      </section>

      <section className="quick" aria-label="Quick actions">
        <QuickKey icon={ICONS.shot} label="SCREENSHOT" disabled={!ready} onClick={() => act(tether.screenshot(), 'SCREENSHOT SAVED')} />
        <QuickKey icon={ICONS.paste} label="PASTE TO PHONE" disabled={!ready} onClick={() => act(tether.pasteToPhone(), 'PASTED ON THE PHONE')} />
        <QuickKey icon={ICONS.off} label="SCREEN OFF" disabled={!ready}
          onClick={() => act(tether.screenOff(), 'SCREEN OFF')} />
        {quick && <span className={`mono tiny quick-msg ${quick.error ? 'danger-text' : 'accent-text'}`} role="status">{quick.text}</span>}
      </section>
      </div>

      <div className="home-row">
        <section className="channels" aria-labelledby="ch-h">
          <div className="row between wrap">
            <h2 id="ch-h" className="card-head">CHANNELS · ONE WINDOW PER APP</h2>
            <button className="link mono" onClick={() => go('apps')}>ALL APPS ›</button>
          </div>
          {state.pins.length ? (
            <div className="pads">
              {state.pins.map((p, i) => (
                <button key={p.pkg} className="pad" disabled={!ready} onClick={() => void tether.openApp(p.pkg, p.name)}>
                  <span className={`led ${state.openViews.includes(`app:${p.pkg}`) ? 'on' : ''}`} />
                  <span className="pad-face" style={{ color: TINTS[i % 4] }}>{p.name.charAt(0).toUpperCase()}</span>
                  <span className="pad-name">{p.name}</span>
                  <span className="mono tiny muted">CH {i + 1}</span>
                </button>
              ))}
            </div>
          ) : <span className="mono small muted">PIN APPS FROM THE APPS SCREEN</span>}
        </section>

      </div>

      <div className="home-row stretch">
        <section className="lcd ticker-lcd" aria-label="Clipboard">
          <span className="dim tiny">CLIPBOARD · {state.clipSettings.sync ? 'SYNC ON' : 'SYNC OFF'}{clipLine && ` · ${clipLine}`}</span>
          {!ticker.length && <span>› NOTHING COPIED YET</span>}
          {ticker.map((c) => {
            const age = Math.max(0, Math.round((now - Date.parse(c.at)) / 60000))
            const who = c.dir === 'phone' ? 'PHONE' : 'PC'
            return (
              <span key={c.id} className="ticker-line" title={DIR_LABEL[c.dir]}>
                › {c.secret ? '●●●●●● CODE HIDDEN' : c.text!.toUpperCase()}{' '}
                <span className="dim">· {c.wipeAt ? `WIPE ${wipeLeft(c, now)}S` : c.note === 'WIPED' ? 'WIPED' : `${who} ${age < 60 ? `${age}M` : `${Math.floor(age / 60)}H`}`}</span>
              </span>
            )
          })}
        </section>

        {state.layouts.length > 0 && (
          <section className="col home-layouts" aria-labelledby="lay-h">
            <h2 id="lay-h" className="mono tiny muted">LAYOUTS</h2>
            {state.layouts.map((l, i) => (
              <button key={i} className="layout-key" disabled={!ready} onClick={() => void tether.launchLayout(i)}>
                {l.name.toUpperCase()}<span className="mono tiny muted">CTRL ALT {i + 1}</span>
              </button>
            ))}
          </section>
        )}

        <section className="drop-card" aria-label="Send files">
          <span className="slot-line" />
          <span className="drop-title">DROP FILES IN</span>
          <span className="muted drop-note">APKs install. Rest goes to Download.</span>
        </section>
      </div>
    </main>
  )
}
