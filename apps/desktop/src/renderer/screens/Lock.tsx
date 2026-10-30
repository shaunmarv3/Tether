import { useState, type FormEvent } from 'react'
import type { AppState } from '../../shared/api'
import { Logo } from '../Logo'
import { tether } from '../tether'

export const MIN_PASSWORD = 8

export function Lock({ state }: { state: AppState }) {
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const setting = !state.hasPin

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (setting) {
      if (pin.length < MIN_PASSWORD) return setError(`PASSWORD IS ${MIN_PASSWORD}+ CHARACTERS`)
      if (pin !== confirm) return setError("PASSWORDS DON'T MATCH")
      if (!(await tether.setPin(pin))) setError("COULDN'T SAVE THE PASSWORD")
      return
    }
    if (!pin) return
    const result = await tether.unlock(pin)
    setPin('')
    if (result === 'wrong') setError('WRONG PASSWORD')
    if (result === 'wait') setError('TOO MANY TRIES · WAIT 30 S')
  }

  return (
    <div className="stage">
      <form className="plate" onSubmit={submit}>
        <header className="plate-head">
          <span className="row"><Logo size={22} /><span className="wordmark">TETHER</span></span>
          <span className="tag">{setting ? 'SETUP' : 'LOCKED'}<span className="led red" /></span>
        </header>

        <div className="lcd screen">
          <div className="screen-row">
            <span className="screen-title">{setting ? 'SET A PASSWORD' : 'LOCKED'}</span>
            <span className="dim tiny">{setting ? `${pin.length}/${MIN_PASSWORD}+` : pin.length ? '●'.repeat(Math.min(pin.length, 8)) : ''}</span>
          </div>
          <div className="slots" aria-hidden="true">
            {Array.from({ length: MIN_PASSWORD }, (_, i) => <span key={i} className={i < pin.length ? 'on' : setting ? 'need' : ''} />)}
          </div>
          {!setting && (state.lockReason || state.phoneLinked) && (
            <div className="col tight">
              {state.lockReason && <span className="dim small">{state.lockReason}</span>}
              {state.phoneLinked && <span className="dim small">PHONE STILL CONNECTED</span>}
            </div>
          )}
        </div>

        <p className="note">
          {setting ? `${MIN_PASSWORD} or more characters, any kind. You enter it every time TETHER opens.` : 'Enter your password to open TETHER.'}
        </p>

        <div className="fields">
          <label className="label" htmlFor="pin"><span className="num">01</span>PASSWORD</label>
          <div className="row">
            <input id="pin" className="field pass-field" type="password" maxLength={64} autoFocus autoComplete="off"
              value={pin} onChange={(e) => { setPin(e.target.value); setError(null) }} />
            {!setting && <button className="key tall" type="submit">UNLOCK</button>}
          </div>

          {setting && (
            <>
              <label className="label" htmlFor="confirm"><span className="num">02</span>CONFIRM</label>
              <input id="confirm" className="field pass-field" type="password" maxLength={64} autoComplete="off"
                value={confirm} onChange={(e) => { setConfirm(e.target.value); setError(null) }} />
            </>
          )}
        </div>

        {setting && <button className="key accent wide" type="submit">SAVE PASSWORD</button>}
        <div className="error" role="alert">{error}</div>
      </form>
    </div>
  )
}
