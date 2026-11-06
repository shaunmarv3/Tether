import { useState, type FormEvent } from 'react'
import type { AppState } from '../../shared/api'
import { Logo } from '../Logo'
import { BareTitleBar } from '../Shell'
import { sentence } from '../text'
import { tether } from '../tether'
import { SetupLayout } from './SetupLayout'

export const MIN_PASSWORD = 8

// Unlock (AP-Lock), or "Set a password" as step 1 of the first-run setup.
export function Lock({ state }: { state: AppState }) {
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const setting = !state.hasPin

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (setting) {
      if (pin.length < MIN_PASSWORD) return setError(`The password needs ${MIN_PASSWORD} or more characters.`)
      if (pin !== confirm) return setError("The passwords don't match.")
      if (!(await tether.setPin(pin))) setError("Couldn't save the password.")
      return
    }
    if (!pin) return
    const result = await tether.unlock(pin)
    setPin('')
    if (result === 'wrong') setError('Wrong password. Try again.')
    if (result === 'wait') setError('Too many tries. Wait 30 s.')
  }

  if (setting) {
    return (
      <SetupLayout step={1}>
        <form className="lock-form" onSubmit={submit}>
          <h1 className="setup-title">Set a password</h1>
          <p className="soft setup-lede">
            {MIN_PASSWORD} or more characters, any kind. You enter it every time Tether opens. You can turn it off later in Security.
          </p>
          <label className="lock-label" htmlFor="pin">Password</label>
          <input id="pin" className={`field lock-field${error ? ' bad' : ''}`} type="password" maxLength={64} autoFocus autoComplete="off"
            value={pin} onChange={(e) => { setPin(e.target.value); setError(null) }} />
          <label className="lock-label" htmlFor="confirm">Same password again</label>
          <input id="confirm" className="field lock-field" type="password" maxLength={64} autoComplete="off"
            value={confirm} onChange={(e) => { setConfirm(e.target.value); setError(null) }} />
          <span className="error-text" role="alert">{error}</span>
          <button className="btn primary lock-btn" type="submit">Save password</button>
        </form>
      </SetupLayout>
    )
  }

  const reason = [state.lockReason && `${sentence(state.lockReason)}.`, state.phoneLinked && 'Your phone is still connected, its screen stays hidden.']
    .filter(Boolean).join(' ')
  return (
    <div className="app">
      <BareTitleBar crumb="Locked" />
      <div className="lock">
        <svg className="lock-mark" width="520" height="520" viewBox="0 0 64 64" aria-hidden="true">
          <path d="M24 6V40Q24 56 40 56H45" fill="none" stroke="#FFB27A" strokeWidth="10" strokeLinecap="round" />
          <path d="M12 22H40" stroke="#F6E9DA" strokeWidth="10" strokeLinecap="round" />
          <circle cx="53" cy="56" r="6" fill="#F6E9DA" />
        </svg>
        <form className="lock-form" onSubmit={submit}>
          <Logo size={48} />
          <h1 className="lock-title">Tether is locked</h1>
          {reason && <p className="muted lock-reason">{reason}</p>}
          <label className="lock-label" htmlFor="pin">Password</label>
          <div className="lock-row">
            <input id="pin" className={`field lock-field${error ? ' bad' : ''}`} type="password" maxLength={64} autoFocus autoComplete="off"
              value={pin} onChange={(e) => { setPin(e.target.value); setError(null) }} />
            <button className="btn primary lock-btn" type="submit">Unlock</button>
          </div>
          <span className="error-text" role="alert">{error}</span>
        </form>
      </div>
    </div>
  )
}
