import { useEffect, useState } from 'react'
import type { Activity, AppState, IdleMinutes } from '../../shared/api'
import { PowerIcon } from '../Sidebar'
import { tether } from '../tether'

const IDLE: [IdleMinutes, string][] = [[0, 'OFF'], [5, '5 MIN'], [10, '10 MIN'], [30, '30 MIN']]

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
const added = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toUpperCase()

function Toggle({ label, note }: { label: string; note: string }) {
  return (
    <div className="setting">
      <span className="col tight">
        <span>{label}</span>
        <span className="mono tiny muted">{note}</span>
      </span>
      <span className="switch on" role="img" aria-label="On" />
    </div>
  )
}

export function Security({ state }: { state: AppState }) {
  const [activity, setActivity] = useState<Activity[] | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const current = state.device?.state === 'device' ? state.device.serialNo : null
  const alarm = state.unknown.length > 0

  // Refresh when something that writes an activity line changes.
  useEffect(() => {
    void tether.getActivity().then(setActivity)
  }, [state.known.length, state.unknown.length, state.idleMinutes, current])

  return (
    <main className="main">
      <header className="col">
        <span className="mono small muted">SECURITY</span>
        <h1 className="headline">Locked down <span className="accent-text">by default.</span></h1>
      </header>

      <div className="cards">
        <section className={`lcd sec-status ${alarm ? 'alarm' : ''}`} aria-label="Security status">
          <span className="sec-big">● {alarm ? 'UNKNOWN DEVICE' : 'ALL CLEAR'}</span>
          <div className="sec-grid">
            <div className="col tight"><span className="dim tiny">TRUSTED PHONES</span><span>{state.known.length}</span></div>
            <div className="col tight"><span className="dim tiny">UNKNOWN DEVICES</span><span className={alarm ? 'red-text' : ''}>{state.unknown.length}</span></div>
            <div className="col tight"><span className="dim tiny">LINK</span><span>USB CABLE ONLY</span></div>
            <div className="col tight"><span className="dim tiny">ADB SERVER</span><span>THIS PC ONLY</span></div>
          </div>
        </section>

        <section className="card lockdown-card" aria-labelledby="ld-h">
          <div className="col">
            <h2 id="ld-h" className="card-title">Lockdown</h2>
            <p className="card-note">Closes every phone window, turns off Wireless debugging on the phone, and locks TETHER.</p>
          </div>
          <button className="key danger" onClick={() => void tether.lockdown()}><PowerIcon />LOCKDOWN NOW</button>
        </section>
      </div>

      <div className="cards top">
        <section className="card" aria-labelledby="lock-h">
          <h2 id="lock-h" className="card-head">APP LOCK</h2>
          <Toggle label="Lock when Windows locks" note="ALWAYS ON · CLOSES PHONE WINDOWS" />
          <Toggle label="Warn me about unknown devices" note="ALWAYS ON" />
          <div className="col idle">
            <span className="mono tiny muted">AUTO-LOCK WHEN IDLE</span>
            <div className="segments" role="group" aria-label="Auto-lock when idle">
              {IDLE.map(([m, label]) => (
                <button key={m} className={`segment ${state.idleMinutes === m ? 'on' : ''}`} aria-pressed={state.idleMinutes === m}
                  onClick={() => void tether.setIdle(m)}>{label}</button>
              ))}
            </div>
          </div>
        </section>

        <div className="col stack">
          <section className="card" aria-labelledby="dev-h">
            <h2 id="dev-h" className="card-head">TRUSTED PHONES</h2>
            {state.known.length === 0 && <span className="mono small muted">NONE YET · PLUG IN YOUR PHONE AND TAP TRUST</span>}
            {state.known.map((k) => (
              <div key={k.serialNo} className="phone-row">
                <div className="row">
                  <span className={`led ${k.serialNo === current ? 'on' : ''}`} />
                  <div className="col tight">
                    <span className="phone-row-name">{k.name}</span>
                    <span className="mono tiny muted">{k.serialNo === current ? 'CONNECTED NOW' : `ADDED ${added(k.addedAt)}`}</span>
                  </div>
                </div>
                {confirming === k.serialNo ? (
                  <div className="row confirm">
                    <span className="mono tiny">FORGET {k.name.toUpperCase()}?</span>
                    <button className="small-key danger-text" onClick={() => { setConfirming(null); void tether.forget(k.serialNo) }}>YES</button>
                    <button className="small-key" onClick={() => setConfirming(null)}>NO</button>
                  </div>
                ) : (
                  <button className="small-key danger-text" onClick={() => setConfirming(k.serialNo)}>FORGET</button>
                )}
              </div>
            ))}
            {state.known.length > 0 && (
              <p className="card-note small-note">
                Forget removes the phone from TETHER only. To fully cut it off, also tap
                “Revoke USB debugging authorisations” in the phone’s Developer options.
              </p>
            )}
          </section>

          <section className="lcd activity" aria-label="Activity log">
            <span className="dim tiny">ACTIVITY</span>
            {activity?.length === 0 && <span>NOTHING YET</span>}
            {activity?.slice(0, 8).map((a, i) => <span key={i}>{hhmm(a.time)} › {a.text.toUpperCase()}</span>)}
          </section>
        </div>
      </div>
    </main>
  )
}
