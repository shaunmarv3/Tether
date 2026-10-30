import type { AppState } from '../../shared/api'
import { Logo } from '../Logo'
import { tether } from '../tether'

// First-run setup chip: n of 3 dots lit (Lock = 1, Engine = 2, Connect = 3).
export function Steps({ n }: { n: number }) {
  return (
    <span className="steps" role="img" aria-label={`Step ${n} of 3`}>
      {[1, 2, 3].map((i) => <span key={i} className={`step-dot${i <= n ? ' on' : ''}`} />)}
      STEP {n} OF 3
    </span>
  )
}

const STEPS = [
  ['Turn on Developer options', 'Settings → About phone → tap Build number 7 times'],
  ['Turn on USB debugging', 'Settings → System → Developer options'],
  ['Plug in and allow', "Tick 'Always allow from this computer'"],
]

// First run: walk the user from no phone to one trusted USB phone. Leaves by itself once known.length > 0.
export function Connect({ state, skip }: { state: AppState; skip: () => void }) {
  const found = state.unknown[0]
  const pending = state.device?.state
  const asking = !found && pending === 'unauthorized'
  const lcd = found ? `● FOUND ${(found.name ?? found.serialNo ?? found.serial).toUpperCase()}`
    : asking ? "ACCEPT 'ALLOW USB DEBUGGING?' ON YOUR PHONE"
    : pending === 'offline' ? 'PHONE OFFLINE · REPLUG THE CABLE'
    : null

  return (
    <div className="setup">
      <div className="setup-inner">
        <header className="setup-head">
          <span className="row"><Logo size={28} /><span className="wordmark big">TETHER</span></span>
          <Steps n={3} />
        </header>

        <div className="col setup-intro">
          <h1 className="headline setup-title">Tie your phone <span className="accent-text">to this PC.</span></h1>
          <p className="setup-lede">One USB cable. Your phone asks once, then TETHER knows it.</p>
        </div>

        <div className="setup-cards">
          <section className="setup-card steps-card" aria-labelledby="steps-h">
            <h2 id="steps-h" className="card-head">ON YOUR PHONE</h2>
            <ol className="step-list">
              {STEPS.map(([title, how], i) => (
                <li key={title} className={`step${asking && i === 2 ? ' current' : ''}`}>
                  <span className="step-num">0{i + 1}</span>
                  <span className="col tight"><span className="step-title">{title}</span><span className="step-how">{how}</span></span>
                </li>
              ))}
            </ol>
            <p className="card-note small-note">Xiaomi / Redmi / POCO: also turn on USB debugging (Security settings).</p>
          </section>

          <section className="card setup-card" aria-labelledby="connect-h">
            <div className="lcd connect-lcd" role="status">
              <span>{lcd ?? <><span className="blink">●</span> WAITING FOR A USB CABLE</>}</span>
              <span className="dim tiny">USB</span>
            </div>
            <h2 id="connect-h" className="card-title">
              {found ? 'Is this your phone?' : asking ? 'Allow it on your phone' : 'Plug in your phone'}
            </h2>
            <p className="card-note">
              {found ? 'Trust it so TETHER can show and control it. Only trust a phone that is yours.'
                : 'TETHER finds it as soon as it is plugged in and USB debugging is on.'}
            </p>
            <button className="key accent wide" disabled={!found?.serialNo} onClick={() => void tether.trust(found!.serialNo!)}>
              TRUST THIS PHONE
            </button>
          </section>
        </div>

        <footer className="setup-foot">
          <span className="row">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z" />
            </svg>
            Only phones you trust here can be shown or controlled. Nothing is installed on the phone.
          </span>
          <button className="link setup-later" onClick={skip}>LATER</button>
        </footer>
      </div>
    </div>
  )
}
