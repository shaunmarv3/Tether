import type { AppState } from '../../shared/api'
import { sentence } from '../text'
import { tether } from '../tether'
import { SetupLayout } from './SetupLayout'

// Step 2 of the first run: scrcpy + adb, downloaded once and checked (AP-Setup).
export function Engine({ state }: { state: AppState }) {
  const busy = state.engine === 'installing'
  const pct = state.enginePct ?? 0

  return (
    <SetupLayout step={2}>
      <h1 className="setup-title">Download the engine</h1>
      <p className="soft setup-lede">Tether uses scrcpy and adb to show and control your phone. They download once, then work offline.</p>
      <dl className="setup-specs">
        <dt>Package</dt><dd>scrcpy 5.0 + adb</dd>
        <dt>Source</dt><dd>Official GitHub release</dd>
        <dt>Size</dt><dd>11.3 MB, once</dd>
        <dt>Check</dt><dd>Pinned SHA&#8209;256 before it runs</dd>
      </dl>
      {busy && (
        <div className="setup-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Download">
          <div className="mono muted setup-progress-line"><span>{sentence(state.engineProgress ?? 'Downloading')}</span><span>{pct}%</span></div>
          <div className="setup-bar"><i style={{ width: `${pct}%` }} /></div>
        </div>
      )}
      <button className="btn primary setup-btn" disabled={busy} onClick={() => void tether.installEngine()}>
        {busy ? 'Downloading…' : 'Download the engine'}
      </button>
      {state.engineError && <span className="error-text" role="alert">{sentence(state.engineError)}</span>}
    </SetupLayout>
  )
}
