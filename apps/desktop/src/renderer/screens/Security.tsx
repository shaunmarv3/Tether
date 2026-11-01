import { useEffect, useState, type FormEvent } from 'react'
import type { Activity, AppState, IdleMinutes } from '../../shared/api'
import { PowerIcon } from '../Sidebar'
import { tether } from '../tether'
import { Switch } from './Clipboard'
import { MIN_PASSWORD } from './Lock'

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

// Turning the password off needs it once, so someone at an open TETHER can't just flip it.
function PasswordSwitch({ off }: { off: boolean }) {
  const [asking, setAsking] = useState(false)
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const close = () => { setAsking(false); setPw(''); setMsg(null) }

  async function turnOff(e: FormEvent) {
    e.preventDefault()
    const result = await tether.setPasswordOff(true, pw)
    if (result === 'ok') close()
    else setMsg(result === 'wait' ? 'TOO MANY TRIES · WAIT 30 S' : 'WRONG PASSWORD')
  }

  return (
    <>
      <Switch label="Ask for the password" on={!off}
        set={(on) => (on ? void tether.setPasswordOff(false, '') : asking ? close() : setAsking(true))} />
      {asking && (
        <form className="col" onSubmit={turnOff}>
          <label className="mono tiny muted" htmlFor="pw-off">TYPE YOUR PASSWORD TO TURN IT OFF</label>
          <input id="pw-off" className="field pass-field small-field" type="password" maxLength={64} autoComplete="off" autoFocus
            value={pw} onChange={(e) => { setPw(e.target.value); setMsg(null) }} />
          <div className="row between wrap">
            <span className="mono tiny danger-text" role="status">{msg}</span>
            <div className="row">
              <button className="key" type="button" onClick={close}>CANCEL</button>
              <button className="key danger" type="submit" disabled={pw.length < 4}>TURN OFF</button>
            </div>
          </div>
        </form>
      )}
      {off && (
        <span className="mono tiny amber-text" role="status">
          OFF · TETHER OPENS WITHOUT A PASSWORD · WINDOWS LOCK AND IDLE STILL CLOSE PHONE WINDOWS AND STOP THE AI
        </span>
      )}
    </>
  )
}

function PasswordCard({ weak }: { weak: boolean }) {
  const [form, setForm] = useState({ current: '', next: '', again: '' })
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null)
  const field = (k: keyof typeof form) => ({
    value: form[k], onChange: (e: { target: { value: string } }) => { setForm({ ...form, [k]: e.target.value }); setMsg(null) },
  })

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (form.next.length < MIN_PASSWORD) return setMsg({ text: `NEW PASSWORD IS ${MIN_PASSWORD}+ CHARACTERS`, error: true })
    if (form.next !== form.again) return setMsg({ text: "NEW PASSWORDS DON'T MATCH", error: true })
    if (form.next === form.current) return setMsg({ text: 'PICK A DIFFERENT PASSWORD', error: true })
    if (form.current.length < 4) return setMsg({ text: 'WRONG CURRENT PASSWORD', error: true })
    const result = await tether.changePassword(form.current, form.next)
    if (result === 'ok') {
      setForm({ current: '', next: '', again: '' })
      setMsg({ text: 'PASSWORD CHANGED', error: false })
    } else setMsg({ text: result === 'wait' ? 'TOO MANY TRIES · WAIT 30 S' : 'WRONG CURRENT PASSWORD', error: true })
  }

  return (
    <form className="card" aria-labelledby="pw-h" onSubmit={submit}>
      <h2 id="pw-h" className="card-head">PASSWORD</h2>
      {weak && <span className="mono tiny amber-text">YOU STILL USE AN OLD SHORT PIN · SET A PASSWORD OF {MIN_PASSWORD}+ CHARACTERS</span>}
      <label className="mono tiny muted" htmlFor="pw-cur">CURRENT</label>
      <input id="pw-cur" className="field pass-field small-field" type="password" maxLength={64} autoComplete="off" {...field('current')} />
      <label className="mono tiny muted" htmlFor="pw-new">NEW · {MIN_PASSWORD}+ CHARACTERS</label>
      <input id="pw-new" className="field pass-field small-field" type="password" maxLength={64} autoComplete="off" {...field('next')} />
      <label className="mono tiny muted" htmlFor="pw-again">NEW AGAIN</label>
      <input id="pw-again" className="field pass-field small-field" type="password" maxLength={64} autoComplete="off" {...field('again')} />
      <div className="row between wrap">
        <span className={`mono tiny ${msg?.error ? 'danger-text' : 'accent-text'}`} role="status">{msg?.text}</span>
        <button className="key" type="submit" disabled={!form.current || !form.next}>CHANGE PASSWORD</button>
      </div>
    </form>
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
        <div className="col stack">
          <section className="card" aria-labelledby="lock-h">
            <h2 id="lock-h" className="card-head">APP LOCK</h2>
            <PasswordSwitch off={state.passwordOff} />
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
          <PasswordCard weak={state.weakPassword} />
        </div>

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
