import type { AppState } from '../../shared/api'
import { tether } from '../tether'
import { Steps } from './Connect'

const SEGMENTS = 24

export function Engine({ state }: { state: AppState }) {
  const busy = state.engine === 'installing'
  const lit = Math.round(((state.enginePct ?? 0) / 100) * SEGMENTS)

  return (
    <div className="stage">
      <div className="plate">
        <header className="plate-head">
          <span className="wordmark">TETHER</span>
          {busy ? <span className="tag">WORKING<span className="led amber blink" /></span>
            : state.known.length ? <span className="tag">SETUP<span className="led red" /></span> : <Steps n={2} />}
        </header>

        <div className="lcd screen">
          <div className="screen-row">
            <span className="screen-title">ENGINE</span>
            <span className="dim tiny">{busy ? `${state.enginePct ?? 0}%` : 'NOT INSTALLED'}</span>
          </div>
          <div className="meter" aria-hidden="true">
            {Array.from({ length: SEGMENTS }, (_, i) => <span key={i} className={i < lit ? 'on' : ''} />)}
          </div>
          <span className="dim tiny">{state.engineProgress ?? 'READY TO DOWNLOAD'}</span>
        </div>

        <dl className="specs">
          <dt>PACKAGE</dt><dd>scrcpy 5.0 + adb</dd>
          <dt>SOURCE</dt><dd>Official GitHub release</dd>
          <dt>SIZE</dt><dd>11.3 MB, once</dd>
          <dt>CHECK</dt><dd>Pinned SHA&#8209;256 before it runs</dd>
        </dl>

        <button className="key accent wide" disabled={busy} onClick={() => void tether.installEngine()}>
          {busy ? 'DOWNLOADING…' : 'DOWNLOAD ENGINE'}
        </button>
        <div className="error" role="alert">{state.engineError}</div>
      </div>
    </div>
  )
}
