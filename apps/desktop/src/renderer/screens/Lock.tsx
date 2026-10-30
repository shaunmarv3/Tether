import { useState, type FormEvent } from 'react'
import type { AppState } from '../../shared/api'
import { tether } from '../tether'

export function Lock({ state }: { state: AppState }) {
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const setting = !state.hasPin

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!/^\d{4,8}$/.test(pin)) return setError('PIN IS 4–8 DIGITS')
    if (setting) {
      if (pin !== confirm) return setError("PINS DON'T MATCH")
      if (!(await tether.setPin(pin))) setError("COULDN'T SAVE THE PIN")
      return
    }
    const result = await tether.unlock(pin)
    setPin('')
    if (result === 'wrong') setError('WRONG PIN')
    if (result === 'wait') setError('TOO MANY TRIES · WAIT 30 S')
  }

  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 8)

  return (
    <div className="stage">
      <form className="plate" onSubmit={submit}>
        <header className="plate-head">
          <span className="wordmark">TETHER</span>
          <span className="tag">{setting ? 'SETUP' : 'LOCKED'}<span className="led red" /></span>
        </header>

        <div className="lcd screen">
          <div className="screen-row">
            <span className="screen-title">{setting ? 'SET A PIN' : 'LOCKED'}</span>
            <span className="dim tiny">{pin.length}/8</span>
          </div>
          <div className="slots" aria-hidden="true">
            {Array.from({ length: 8 }, (_, i) => <span key={i} className={i < pin.length ? 'on' : i < 4 ? 'need' : ''} />)}
          </div>
          {!setting && (state.lockReason || state.phoneLinked) && (
            <div className="col tight">
              {state.lockReason && <span className="dim small">{state.lockReason}</span>}
              {state.phoneLinked && <span className="dim small">PHONE STILL CONNECTED</span>}
            </div>
          )}
        </div>

        <p className="note">
          {setting ? 'Pick 4 to 8 digits. You enter it every time TETHER opens.' : 'Enter your PIN to open TETHER.'}
        </p>

        <div className="fields">
          <label className="label" htmlFor="pin"><span className="num">01</span>PIN</label>
          <div className="row">
            <input id="pin" className="field" type="password" inputMode="numeric" maxLength={8} autoFocus
              value={pin} onChange={(e) => { setPin(digits(e.target.value)); setError(null) }} />
            {!setting && <button className="key tall" type="submit">UNLOCK</button>}
          </div>

          {setting && (
            <>
              <label className="label" htmlFor="confirm"><span className="num">02</span>CONFIRM</label>
              <input id="confirm" className="field" type="password" inputMode="numeric" maxLength={8}
                value={confirm} onChange={(e) => { setConfirm(digits(e.target.value)); setError(null) }} />
            </>
          )}
        </div>

        {setting && <button className="key accent wide" type="submit">SAVE PIN</button>}
        <div className="error" role="alert">{error}</div>
      </form>
    </div>
  )
}
