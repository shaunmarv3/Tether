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
  if (!d) return state.unknown.length ? 'NEW PHONE · TRUST IT TO CONNECT' : 'NO PHONE · PLUG IN A USB CABLE'
  if (d.state === 'unauthorized') return "ACCEPT 'ALLOW USB DEBUGGING?' ON YOUR PHONE"
  if (d.state !== 'device') return 'PHONE OFFLINE · REPLUG THE CABLE'
  if (!state.status) return 'READING PHONE…'
  return null
}

export function Home({ state, ignored, ignore }: { state: AppState; ignored: string[]; ignore: (serialNo: string) => void }) {
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
        <button className="key accent tall" disabled={!ready} onClick={() => void tether.openMirror()}>
          <span className={`led ${state.mirrorOpen ? 'on' : ''}`} />MIRROR
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
  )
}
