import { useEffect, useRef, useState } from 'react'
import type { AppState } from '../../shared/api'
import { tether } from '../tether'
import { ICON, Icon } from '../ui'
import { errText } from './Files'

const DAY = 86_400_000

// Will the phone ask "Allow USB debugging?" again some day? Android 11+ forgets a PC after a week unused
// unless "Disable adb authorization timeout" is on (adbTimeoutMs 0). null = can't tell (no phone / older Android).
export function forgetDays(state: AppState): number | null {
  const s = state.status
  if (state.device?.state !== 'device' || !s || Number.parseInt(s.android, 10) < 11) return null
  if (s.adbTimeoutMs === 0) return null
  return Math.max(1, Math.round((s.adbTimeoutMs ?? 7 * DAY) / DAY))
}

// Bottom-right on Home, every start, until the phone keeps this PC for good (user, 2026-11-06).
export function TrustToast({ days, open, close }: { days: number; open: () => void; close: () => void }) {
  return (
    <div className="trust-toast" role="status">
      <button className="trust-open" onClick={open}>
        <Icon d={ICON.lock} size={18} stroke="var(--accent)" />
        <span>
          <span className="trust-title">Your phone can forget this PC</span>
          <span className="trust-note">After {days} days without a connection it asks “Allow USB debugging?” again. Fix it once ›</span>
        </span>
      </button>
      <button className="icon-btn ghost trust-close" aria-label="Hide until Tether opens again" title="Hide until Tether opens again" onClick={close}>
        <Icon d={ICON.close} size={14} width={1.8} />
      </button>
    </div>
  )
}

// Security page: what "trusted for good" takes, and a button that does the phone setting.
export function TrustSection({ state, focus, done }: { state: AppState; focus: boolean; done: () => void }) {
  const box = useRef<HTMLElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ready = state.device?.state === 'device' && !!state.status
  const days = forgetDays(state)
  const forever = ready && state.status!.adbTimeoutMs === 0
  const old = ready && Number.parseInt(state.status!.android, 10) < 11

  useEffect(() => {
    if (!focus) return
    box.current?.scrollIntoView({ block: 'start' })
    box.current?.focus()
    done()
  }, [focus])

  const set = (on: boolean) => {
    setBusy(true)
    setError(null)
    tether.keepTrust(on).catch((err) => setError(errText(err))).finally(() => setBusy(false))
  }

  return (
    <section ref={box} tabIndex={-1} className={`sec-section trust${days ? ' warn' : ''}`} aria-labelledby="sc-trust">
      <h2 id="sc-trust">Phone trust</h2>
      <p className={forever ? 'sec-ok trust-state' : 'soft trust-state'}>
        {!ready ? 'Plug in your phone to check how long it trusts this PC.'
          : forever ? 'Your phone never forgets this PC.'
          : old ? 'Your phone remembers this PC once you tick “Always allow from this computer”.'
          : `Your phone forgets this PC after ${days} days without a connection, then asks “Allow USB debugging?” again.`}
      </p>
      <ol className="trust-steps">
        <li>When the phone asks “Allow USB debugging?”, tick <b>Always allow from this computer</b>, then tap Allow.</li>
        <li>In Developer options, turn on <b>Disable adb authorization timeout</b>{days ? ', or let Tether do it below' : ''}.</li>
        <li>Keep USB debugging on, and don't press <b>Revoke USB debugging authorisations</b>.</li>
      </ol>
      {ready && !old && (forever
        ? <button className="link-btn trust-undo" disabled={busy} onClick={() => set(false)}>Let the phone forget this PC after 7 days again</button>
        : <button className="btn primary mid trust-btn" disabled={busy} onClick={() => set(true)}>{busy ? 'Setting it…' : 'Turn it on for me'}</button>)}
      {error && <span className="error-text" role="alert">{error}</span>}
      <p className="muted small-print">
        The other side: with it on, a stolen PC stays trusted until you press Revoke on the phone. Tether's password still guards Tether.
      </p>
    </section>
  )
}
