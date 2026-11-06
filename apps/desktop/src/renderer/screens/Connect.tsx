import type { AppState } from '../../shared/api'
import { tether } from '../tether'
import { SetupLayout } from './SetupLayout'

// First run, step 3: walk the user from no phone to one trusted USB phone. Leaves by itself once known.length > 0.
export function Connect({ state, skip }: { state: AppState; skip: () => void }) {
  const found = state.unknown[0]
  const pending = state.device?.state
  const asking = !found && pending === 'unauthorized'
  const status = found ? `Found ${found.name ?? found.serialNo ?? found.serial}`
    : asking ? 'Check your phone: tap Allow on “Allow USB debugging?”'
    : pending === 'offline' ? 'Phone offline. Replug the cable.'
    : 'Waiting for a USB cable'

  return (
    <SetupLayout step={3}>
      <h1 className="setup-title">{found ? 'Is this your phone?' : 'Connect your phone'}</h1>
      <p className="soft setup-lede">
        {found ? 'Trust it so Tether can show and control it. Only trust a phone that is yours.'
          : 'One USB cable. Your phone asks once, then Tether knows it.'}
      </p>
      <div className="setup-how">
        <ol className="setup-list">
          <li>On the phone, open Settings, About phone, and tap Build number 7 times.</li>
          <li>In Developer options, turn on USB debugging.</li>
          <li>Plug the phone into this PC with a USB cable.</li>
          <li className={asking ? 'on' : undefined}>On the phone, tap Allow when it asks about USB debugging. Tick “Always allow from this computer”.</li>
        </ol>
        <svg width="220" height="150" viewBox="0 0 220 150" aria-hidden="true">
          <rect x="14" y="16" width="62" height="118" rx="12" fill="#FFB27A" />
          <path d="M45 134V140Q45 146 60 146H140Q150 146 150 136V118" fill="none" stroke="#F6E9DA" strokeWidth="4" strokeLinecap="round" />
          <rect x="110" y="30" width="96" height="66" rx="6" fill="none" stroke="#F6E9DA" strokeWidth="4" />
          <path d="M100 112H216" stroke="#F6E9DA" strokeWidth="4" strokeLinecap="round" />
        </svg>
      </div>
      <div className="setup-status" role="status">
        <span className="wait-dot small" />
        <span className="grow setup-status-text">{status}</span>
        <span className="mono muted">USB</span>
      </div>
      {found?.serialNo && <button className="btn primary setup-btn" onClick={() => void tether.trust(found.serialNo!)}>Trust this phone</button>}
      <p className="muted small-print">Xiaomi, Redmi or POCO: also turn on USB debugging (Security settings).</p>
      <p className="muted small-print">Only phones you trust here can be shown or controlled. Nothing is installed on the phone.</p>
      <button className="link-btn" onClick={skip}>Later</button>
    </SetupLayout>
  )
}
