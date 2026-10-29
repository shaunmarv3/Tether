import type { AppState } from '../../shared/api'
import { tether } from '../tether'

function today(): string {
  const d = new Date()
  const weekday = d.toLocaleDateString('en-GB', { weekday: 'long' })
  const month = d.toLocaleDateString('en-GB', { month: 'short' })
  return `${weekday} · ${d.getDate()} ${month}`.toUpperCase()
}

function lcdMessage(state: AppState): string | null {
  const d = state.device
  if (!d) return 'NO PHONE · PLUG IN A USB CABLE'
  if (d.state === 'unauthorized') return "ACCEPT 'ALLOW USB DEBUGGING?' ON YOUR PHONE"
  if (d.state !== 'device') return 'PHONE OFFLINE · REPLUG THE CABLE'
  if (!state.status) return 'READING PHONE…'
  return null
}

export function Home({ state }: { state: AppState }) {
  const { device, status } = state
  const ready = device?.state === 'device'
  const name = status?.model ?? device?.model ?? 'NO PHONE'
  const link = device ? (device.transport === 'usb' ? 'USB' : 'WI-FI') : '—'
  const message = lcdMessage(state)
  const bars = Math.round((status?.batteryPct ?? 0) / 10)

  return (
    <div className="shell">
      <aside className="sidebar">
        <span className="wordmark big">TETHER</span>
        <div className="phone-card">
          <div className="row">
            <span className={`led ${ready ? 'on' : ''}`} />
            <span className="phone-name">{name}</span>
          </div>
          <span className="mono tiny muted">{ready ? `${link}${status ? ` · ${status.latencyMs} MS` : ''}` : 'NOT CONNECTED'}</span>
        </div>
        <nav className="nav">
          <span className="nav-key current">HOME<span className="led on" /></span>
        </nav>
      </aside>

      <main className="main">
        <header className="row between wrap">
          <div className="col">
            <span className="mono tiny muted">{today()}</span>
            <h1 className="headline">Your phone is <span className="accent-text">on the line.</span></h1>
          </div>
          <button className="key accent tall" disabled={!ready} onClick={() => void tether.openMirror()}>
            <span className={`led ${state.mirrorOpen ? 'on' : ''}`} />MIRROR
          </button>
        </header>
        {state.mirrorError && (
          <div className="error">MIRROR CLOSED · {state.mirrorError.replace(/^(WARN|ERROR|INFO):\s*/, '').toUpperCase()}</div>
        )}

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
      </main>
    </div>
  )
}
