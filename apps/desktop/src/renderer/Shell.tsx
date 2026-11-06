import type { ReactNode } from 'react'
import type { AppState, FileOp } from '../shared/api'
import { Logo } from './Logo'
import type { ViewInfo } from './PhoneView'
import { sentence } from './text'
import { tether } from './tether'
import { ICON, Icon } from './ui'

export type Page = 'home' | 'apps' | 'files' | 'clipboard' | 'notifications' | 'pilot' | 'layouts' | 'security'

export const PAGES: [Page, string, string][] = [
  ['home', 'Home', ICON.home], ['apps', 'Apps', ICON.apps], ['files', 'Files', ICON.files], ['clipboard', 'Clipboard', ICON.clip],
  ['notifications', 'Notifications', ICON.bell], ['pilot', 'AI Pilot', ICON.pilot], ['layouts', 'Layouts', ICON.layouts],
  ['security', 'Security', ICON.shield],
]
export const pageName = (p: Page) => PAGES.find(([id]) => id === p)![1]

export function aiState(state: AppState): 'idle' | 'waiting for you' | 'driving' {
  const ai = state.pilot
  if (ai.question || ai.current?.status === 'waiting') return 'waiting for you'
  return ai.current?.status === 'running' ? 'driving' : 'idle'
}

// The fixed app frame: title bar, icon rail, [dock], page pane, status bar (spec §5).
export function Shell({ state, page, go, onRail, compact, dock, badges, info, hint, children }: {
  state: AppState; page: Page; go: (p: Page) => void; onRail?: (p: Page) => void; compact: boolean
  dock: ReactNode; badges: ReactNode; info: ViewInfo | null; hint?: string; children: ReactNode
}) {
  return (
    <div className="app">
      <TitleBar page={page} badges={badges} />
      <div className="app-body">
        <Rail state={state} page={page} go={onRail ?? go} compact={compact} />
        {dock}
        {children}
      </div>
      <StatusBar state={state} info={info} hint={hint} />
    </div>
  )
}

function TitleBar({ page, badges }: { page: Page; badges: ReactNode }) {
  return (
    <header className="titlebar">
      <Logo size={16} />
      <span className="titlebar-name">Tether</span>
      <span className="muted">{pageName(page)}</span>
      <span className="spacer" />
      <div className="titlebar-badges">{badges}</div>
    </header>
  )
}

function Rail({ state, page, go, compact }: { state: AppState; page: Page; go: (p: Page) => void; compact: boolean }) {
  const canLock = state.hasPin && !state.passwordOff
  return (
    <nav aria-label="Main" className={`rail${compact ? ' compact' : ''}`}>
      {PAGES.map(([p, label, d]) => (
        <button key={p} className="rail-item" aria-current={page === p ? 'page' : undefined} title={label}
          aria-label={compact ? label : undefined} onClick={() => go(p)}>
          <span className="rail-icon"><Icon d={d} size={19} /></span>
          {!compact && <span className="rail-label">{label}</span>}
        </button>
      ))}
      <span className="spacer" />
      {canLock && (
        <button className="rail-lock" aria-label="Lock Tether now" title="Lock Tether now" onClick={() => void tether.lockNow()}>
          <Icon d={ICON.lock} size={19} />
        </button>
      )}
    </nav>
  )
}

function StatusBar({ state, info, hint }: { state: AppState; info: ViewInfo | null; hint?: string }) {
  const { device, status } = state
  const ready = device?.state === 'device'
  const name = status?.model ?? device?.name ?? (state.unknown.length ? 'New phone' : 'No phone')
  const link = device ? (device.transport === 'usb' ? 'USB' : 'Wi-Fi') : null
  const phone = [name, ready && link, ready && status && `${status.latencyMs} ms`].filter(Boolean).join(' · ')
  return (
    <footer className="statusbar">
      <span className={ready ? 'statusbar-phone' : 'muted'}><span className={`status-dot${ready ? ' on' : ''}`} />{phone}</span>
      {info && <span>{info.width} × {info.height} · {info.fps} fps</span>}
      {status?.batteryPct != null && <span>Battery {status.batteryPct}%</span>}
      <span>Clipboard sync {state.clipSettings.sync ? 'on' : 'off'}</span>
      <span>AI {aiState(state)}</span>
      <span className="spacer" />
      {hint && <span className="statusbar-hint">{hint}</span>}
    </footer>
  )
}

// Unknown-phone and old-PIN banners, top of the page pane on every page.
export function Banners({ state, ignored, ignore, go }: {
  state: AppState; ignored: string[]; ignore: (serialNo: string) => void; go: (p: Page) => void
}) {
  const strangers = state.unknown.filter((u) => !ignored.includes(u.serialNo!))
  if (!strangers.length && !state.weakPassword) return null
  return (
    <div className="banners">
      {strangers.map((u) => (
        <div key={u.serialNo} className="banner danger" role="alert">
          <Icon d={ICON.warn} size={20} stroke="var(--danger)" width={1.8} />
          <div className="banner-text">
            <div className="banner-title">Unknown phone: {u.name ?? u.serialNo}</div>
            <div className="banner-note">
              {state.known.length
                ? 'A phone Tether has never seen is plugged in. Trust it only if it is yours.'
                : 'First time here. Trust this phone so Tether can show and control it.'}
            </div>
          </div>
          <button className="btn primary mid" onClick={() => void tether.trust(u.serialNo!)}>Trust</button>
          <button className="btn mid banner-ghost" onClick={() => ignore(u.serialNo!)}>Ignore</button>
        </div>
      ))}
      {state.weakPassword && (
        <div className="banner warn" role="alert">
          <Icon d={ICON.lock} size={20} stroke="var(--accent)" width={1.8} />
          <div className="banner-text">
            <div className="banner-title">Old short PIN</div>
            <div className="banner-note">Tether now uses a password of 8 or more characters. Set one on the Security page.</div>
          </div>
          <button className="btn primary mid" onClick={() => go('security')}>Set password</button>
        </div>
      )}
    </div>
  )
}

export type Toast = { text: string; kind: 'ok' | 'busy' | 'error'; action?: [string, () => void] }

export function fileToast(op: FileOp): Toast {
  const folder = op.text!.endsWith('OPEN FOLDER')
  return {
    text: sentence(op.text!.replace(' · OPEN FOLDER', '')),
    kind: op.error ? 'error' : op.busy ? 'busy' : 'ok',
    action: folder ? ['Open folder', () => void tether.openSaveFolder()] : undefined,
  }
}

// Floating at the bottom of the page pane: results 5 s, busy with a bar, errors danger-toned (AP-Parts).
export function Toasts({ toast, apks, installReady, install, cancel }: {
  toast: Toast | null; apks: string[]; installReady: boolean; install: () => void; cancel: () => void
}) {
  if (!apks.length && !toast) return null
  return (
    <div className="toasts">
      {apks.length > 0 ? (
        <div className="toast install" role="alertdialog" aria-label="Install app">
          <span className="grow ellipsis"><b>Install {apks[0].split(/[\\/]/).pop()}?</b>
            {apks.length > 1 && <span className="muted"> {apks.length - 1} more after this</span>}</span>
          <button className="btn primary mid" disabled={!installReady} onClick={install}>Install</button>
          <button className="btn mid" onClick={cancel}>Cancel</button>
        </div>
      ) : toast && (
        <div className={`toast ${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
          {toast.kind === 'ok' && <span className="toast-dot" />}
          <span className="grow">{toast.text}</span>
          {toast.kind === 'busy' && <span className="toast-bar"><i /></span>}
          {toast.action && <button className="link-btn toast-action" onClick={toast.action[1]}>{toast.action[0]}</button>}
        </div>
      )}
    </div>
  )
}

export function DropOverlay({ ready, where }: { ready: boolean; where: string }) {
  return (
    <div className="drop-overlay" aria-hidden="true">
      <div className="drop-box">
        <Icon d={ICON.download} size={34} stroke="var(--accent)" />
        <span className="drop-title">{ready ? 'Drop to send' : 'No phone'}</span>
        <span className="mono muted">{ready ? `to ${where} · APKs ask to install` : 'Plug in a USB cable'}</span>
      </div>
    </div>
  )
}
