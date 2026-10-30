import type { AppState } from '../../shared/api'
import type { Page } from '../Sidebar'
import { tether } from '../tether'

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

export function Home({ state, go, ignored, ignore }: {
  state: AppState; go: (p: Page) => void; ignored: string[]; ignore: (serialNo: string) => void
}) {
  const { device, status } = state
  const ready = device?.state === 'device'
  const link = device ? (device.transport === 'usb' ? 'USB' : 'WI-FI') : '—'
  const message = lcdMessage(state)
  const bars = Math.round((status?.batteryPct ?? 0) / 10)
  const strangers = state.unknown.filter((u) => !ignored.includes(u.serialNo!))

  return (
    <main className="main">
      <header className="row between wrap">
        <div className="col">
          <span className="mono tiny muted">{today()}</span>
          <h1 className="headline">Your phone is <span className="accent-text">on the line.</span></h1>
        </div>
        <button className="key accent tall" disabled={!ready} onClick={() => go('mirror')}>
          <span className={`led ${state.openViews.includes('mirror') ? 'on' : ''}`} />MIRROR
        </button>
      </header>

      {strangers.map((u) => (
        <section key={u.serialNo} className="alert" role="alert">
          <div className="col">
            <span className="alert-title"><span className="led red" />UNKNOWN PHONE · {(u.name ?? u.serialNo)!.toUpperCase()}</span>
            <span className="alert-note">
              {state.known.length
                ? 'A phone TETHER has never seen is plugged in. Trust it only if it is yours.'
                : 'First time here. Trust this phone so TETHER can show and control it.'}
            </span>
          </div>
          <div className="row">
            <button className="key accent" onClick={() => void tether.trust(u.serialNo!)}>TRUST</button>
            <button className="key" onClick={() => ignore(u.serialNo!)}>IGNORE</button>
          </div>
        </section>
      ))}

      <section className="lcd status" aria-label="Phone status">
        {message ? (
          <div className="lcd-title">{message}</div>
        ) : status && (
          <>
            <div className="col">
              <span className="lcd-big">{status.model.toUpperCase()}</span>
              <span className="dim small">ANDROID {status.android}{status.nothingOs && ` / NOTHING OS ${status.nothingOs}`}</span>
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
      </div>
    </main>
  )
}
