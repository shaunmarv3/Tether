import type { AppState } from '../shared/api'
import { Logo } from './Logo'

export type Page = 'home' | 'mirror' | 'apps' | 'files' | 'clipboard' | 'notifications' | 'layouts' | 'security'

const PAGES: [Page, string][] = [
  ['home', 'HOME'], ['apps', 'APPS'], ['files', 'FILES'], ['clipboard', 'CLIPBOARD'], ['notifications', 'NOTIFICATIONS'],
  ['layouts', 'LAYOUTS'], ['security', 'SECURITY'],
]

export function PowerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F0584A" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 3v9" /><path d="M6.3 6.3a8 8 0 1 0 11.4 0" />
    </svg>
  )
}

export function Sidebar({ state, page, go }: { state: AppState; page: Page; go: (p: Page) => void }) {
  const { device, status } = state
  const ready = device?.state === 'device'
  const name = status?.model ?? device?.name ?? (state.unknown.length ? 'NEW PHONE' : 'NO PHONE')
  const sub = ready
    ? `${device.transport === 'usb' ? 'USB' : 'WI-FI'}${status ? ` · ${status.latencyMs} MS` : ''}`
    : state.unknown.length ? 'NOT TRUSTED YET' : 'NOT CONNECTED'

  return (
    <aside className="sidebar">
      <div className="brand">
        <Logo />
        <span className="wordmark big">TETHER</span>
      </div>

      <div className="phone-card">
        <div className="row">
          <span className={`led ${ready ? 'on' : state.unknown.length ? 'red' : ''}`} />
          <span className="phone-name">{name}</span>
        </div>
        <span className="mono tiny muted">{sub}</span>
      </div>

      <nav className="nav" aria-label="Main">
        {PAGES.map(([p, label]) => (
          <button key={p} className={`nav-key ${page === p ? 'current' : ''}`} aria-current={page === p ? 'page' : undefined}
            onClick={() => go(p)}>
            {label}<span className={`led ${page === p ? 'on' : ''}`} />
          </button>
        ))}
      </nav>
    </aside>
  )
}
