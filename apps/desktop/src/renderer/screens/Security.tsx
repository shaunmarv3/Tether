import { useEffect, useState, type FormEvent } from 'react'
import type { Activity, AppState, IdleMinutes } from '../../shared/api'
import { sentence } from '../text'
import { tether } from '../tether'
import { ICON, Icon, Segmented, Switch } from '../ui'
import { MIN_PASSWORD } from './Lock'
import { TrustSection } from './Trust'

const IDLE: [IdleMinutes, string][] = [[0, 'Off'], [5, '5 min'], [10, '10 min'], [30, '30 min']]
const SHIELD_OK = 'M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6zM9 12l2 2 4-4'
const SHIELD_BAD = 'M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6zM12 8v4M12 15h.01'

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
const added = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

// Turning the password off needs it once, so someone at an open Tether can't just flip it.
function PasswordSwitch({ off }: { off: boolean }) {
  const [asking, setAsking] = useState(false)
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const close = () => { setAsking(false); setPw(''); setMsg(null) }

  async function turnOff(e: FormEvent) {
    e.preventDefault()
    const result = await tether.setPasswordOff(true, pw)
    if (result === 'ok') close()
    else setMsg(result === 'wait' ? 'Too many tries. Wait 30 s.' : 'Wrong password.')
  }

  return (
    <>
      <span className="sec-ask">Ask for it
        <Switch label="Ask for the password" on={!off} set={(on) => (on ? void tether.setPasswordOff(false, '') : asking ? close() : setAsking(true))} />
      </span>
      {asking && (
        <form className="sec-off-form" onSubmit={turnOff}>
          <label className="field-label" htmlFor="pw-off">Type your password to turn it off
            <input id="pw-off" className={`field${msg ? ' bad' : ''}`} type="password" maxLength={64} autoComplete="off" autoFocus
              value={pw} onChange={(e) => { setPw(e.target.value); setMsg(null) }} />
          </label>
          <span className="error-text" role="status">{msg}</span>
          <div className="sec-buttons">
            <button className="btn mid" type="button" onClick={close}>Cancel</button>
            <button className="btn danger mid" type="submit" disabled={pw.length < 4}>Turn off</button>
          </div>
        </form>
      )}
      {off && (
        <p className="sec-warn" role="status">
          Off: Tether opens without a password. Windows lock and idle still close phone windows and stop the AI.
        </p>
      )}
    </>
  )
}

function PasswordForm({ weak, off }: { weak: boolean; off: boolean }) {
  const [form, setForm] = useState({ current: '', next: '', again: '' })
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null)
  const field = (k: keyof typeof form) => ({
    value: form[k], onChange: (e: { target: { value: string } }) => { setForm({ ...form, [k]: e.target.value }); setMsg(null) },
  })

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (form.next.length < MIN_PASSWORD) return setMsg({ text: `The new password needs ${MIN_PASSWORD} or more characters.`, error: true })
    if (form.next !== form.again) return setMsg({ text: "The new passwords don't match.", error: true })
    if (form.next === form.current) return setMsg({ text: 'Pick a different password.', error: true })
    if (form.current.length < 4) return setMsg({ text: 'Wrong current password.', error: true })
    const result = await tether.changePassword(form.current, form.next)
    if (result === 'ok') {
      setForm({ current: '', next: '', again: '' })
      setMsg({ text: 'Password changed.', error: false })
    } else setMsg({ text: result === 'wait' ? 'Too many tries. Wait 30 s.' : 'Wrong current password.', error: true })
  }

  return (
    <section className="sec-section sec-pw" aria-labelledby="sc-pw">
      <div className="sec-pw-head"><h2 id="sc-pw">Password</h2><PasswordSwitch off={off} /></div>
      {weak && <p className="sec-warn">You still use an old short PIN. Set a password of {MIN_PASSWORD} or more characters.</p>}
      <form className="sec-form" onSubmit={submit}>
        <label className="field-label" htmlFor="pw-cur">Current password</label>
        <input id="pw-cur" className="field sec-field" type="password" maxLength={64} autoComplete="off" {...field('current')} />
        <label className="field-label" htmlFor="pw-new">New password, {MIN_PASSWORD} or more characters</label>
        <input id="pw-new" className="field sec-field" type="password" maxLength={64} autoComplete="off" {...field('next')} />
        <label className="field-label" htmlFor="pw-again">New password again</label>
        <input id="pw-again" className="field sec-field" type="password" maxLength={64} autoComplete="off" {...field('again')} />
        {msg && <span className={msg.error ? 'error-text' : 'sec-ok'} role="status">{msg.text}</span>}
        <button className="btn sec-change" type="submit" disabled={!form.current || !form.next}>Change password</button>
      </form>
    </section>
  )
}

// Left column, under the password: a quick read of the settings that matter, from what Tether already knows.
function Checkup({ state }: { state: AppState }) {
  const wifi = state.device?.state === 'device' ? state.status?.wirelessDebugging ?? null : null
  const rows: [boolean, string, string][] = [
    state.passwordOff ? [false, 'Password is off', 'Anyone at this PC can open Tether. Turn on "Ask for it" above.']
      : [true, 'Password is on', 'Tether asks for it every time it opens.'],
    state.idleMinutes === 0 ? [false, 'Auto-lock is off', 'Tether stays open when you walk away. Pick a time under App lock.']
      : [true, `Auto-lock after ${state.idleMinutes} min`, 'Phone windows close and the AI stops when you step away.'],
    state.unknown.length ? [false, `${state.unknown.length} unknown device plugged in`, 'Trust it only if it is yours, or unplug it.']
      : [true, 'No unknown devices', 'Only phones you trusted can be shown or controlled.'],
    ...(wifi === null ? [] : [wifi ? [false, 'Wireless debugging is on', 'The phone can be reached over Wi-Fi. Turn it off in Developer options.']
      : [true, 'Wireless debugging is off', 'Only the USB cable reaches your phone.']] as [boolean, string, string][]),
    state.pilot.askSends ? [true, 'The AI asks before every send', 'You see who and what before anything goes out.']
      : [false, 'The AI sends without asking', 'Only to the planned chat. Turn "Ask before every send" back on in AI Pilot.'],
  ]
  const good = rows.filter(([ok]) => ok).length
  return (
    <section className="sec-section" aria-labelledby="sc-check">
      <div className="sec-pw-head"><h2 id="sc-check">Security checkup</h2><span className="muted">{good} of {rows.length} look good</span></div>
      <ul className="check-list">
        {rows.map(([ok, title, note]) => (
          <li key={title} className={ok ? 'ok' : 'look'}>
            <span className="check-mark" aria-label={ok ? 'Good' : 'Needs a look'}><Icon d={ok ? ICON.check : ICON.warn} size={15} width={2} /></span>
            <span><span className="check-title">{title}</span><span className="check-note">{note}</span></span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function Security({ state, trustFocus = false, trustShown = () => {} }: { state: AppState; trustFocus?: boolean; trustShown?: () => void }) {
  const [activity, setActivity] = useState<Activity[] | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const current = state.device?.state === 'device' ? state.device.serialNo : null
  const alarm = state.unknown.length > 0

  // Refresh when something that writes an activity line changes.
  useEffect(() => {
    void tether.getActivity().then(setActivity)
  }, [state.known.length, state.unknown.length, state.idleMinutes, current])

  return (
    <div className="page sec">
      <header className={`sec-band${alarm ? ' alarm' : ''}`} aria-label="Security status">
        <div className="sec-state">
          <span className="sec-shield">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={alarm ? SHIELD_BAD : SHIELD_OK} />
            </svg>
          </span>
          <div>
            <h1 className="sec-title">{alarm ? 'Unknown device' : 'All clear'}</h1>
            <div className="muted">{alarm ? 'A phone Tether has never seen is plugged in' : 'Only your phone, only this PC'}</div>
          </div>
        </div>
        <dl className="sec-facts">
          <div><dt>Trusted phones</dt><dd>{state.known.length}</dd></div>
          <div><dt>Unknown devices</dt><dd className={alarm ? 'bad' : ''}>{state.unknown.length}</dd></div>
          <div><dt>Link</dt><dd>USB cable only</dd></div>
          <div><dt>adb server</dt><dd>This PC only</dd></div>
        </dl>
      </header>

      <div className="sec-cols">
        <div className="sec-col">
          <section className="sec-section sec-lockdown" aria-labelledby="sc-ld">
            <div className="grow">
              <h2 id="sc-ld">Lockdown</h2>
              <p className="soft">Closes every phone window, turns off Wireless debugging on the phone and locks Tether.</p>
            </div>
            <button className="btn danger big" onClick={() => void tether.lockdown()}>Lockdown now</button>
          </section>
          <PasswordForm weak={state.weakPassword} off={state.passwordOff} />
          <Checkup state={state} />
        </div>

        <div className="sec-col">
          <TrustSection state={state} focus={trustFocus} done={trustShown} />
          <section className="sec-section" aria-labelledby="sc-al">
            <h2 id="sc-al">App lock</h2>
            <div className="sec-line">Lock when Windows locks<span className="muted">Always on</span></div>
            <div className="sec-line">Warn me about unknown devices<span className="muted">Always on</span></div>
            <div className="field-label sec-idle">Auto-lock when idle</div>
            <Segmented label="Auto-lock when idle" full value={state.idleMinutes} set={(m) => void tether.setIdle(m)} options={IDLE} />
          </section>

          <section className="sec-section" aria-labelledby="sc-tp">
            <h2 id="sc-tp">Trusted phones</h2>
            {state.known.length === 0 && <p className="muted">None yet. Plug in your phone and tap Trust.</p>}
            {state.known.map((k) => (
              <div key={k.serialNo} className="sec-phone">
                <span className={`status-dot${k.serialNo === current ? ' on' : ''}`} />
                <span className="grow">
                  <span className="sec-phone-name">{k.name}</span>
                  <span className="muted sec-phone-sub">{k.serialNo === current ? 'Connected now' : `Added ${added(k.addedAt)}`}</span>
                </span>
                {confirming === k.serialNo ? (
                  <span className="sec-confirm" role="alert">Forget {k.name}?
                    <button className="btn danger small" onClick={() => { setConfirming(null); void tether.forget(k.serialNo) }}>Yes</button>
                    <button className="btn small" onClick={() => setConfirming(null)}>No</button>
                  </span>
                ) : (
                  <button className="btn small sec-forget" onClick={() => setConfirming(k.serialNo)}>Forget</button>
                )}
              </div>
            ))}
            {state.known.length > 0 && (
              <p className="muted small-print sec-note">
                Forget removes the phone from Tether only. To fully cut it off, also tap
                “Revoke USB debugging authorisations” in the phone’s Developer options.
              </p>
            )}
          </section>

          <section className="sec-section" aria-labelledby="sc-act">
            <h2 id="sc-act">Activity</h2>
            <div className="mono sec-activity">
              {activity?.length === 0 && <span>Nothing yet</span>}
              {activity?.slice(0, 8).map((a, i) => <span key={i}>{hhmm(a.time)} · {sentence(a.text)}</span>)}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
