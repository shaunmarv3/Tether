import type { ViewId } from '../shared/api'
import { Logo } from './Logo'
import { NAV, PhoneView, pressKey } from './PhoneView'
import { ICON, Icon, Tile, toneOf, TONES } from './ui'

// Root of an app window (AP-Windows): a 36 px draggable bar (Windows draws min/max/close over its right end) + the
// screen edge to edge. Also the pop-out phone window (view 'mirror'). slot = the app's pin slot, for its tile colour.
export function AppWindow({ view, name, free, slot = -1 }: { view: ViewId; name: string; free: boolean; slot?: number }) {
  const pkg = view === 'mirror' ? null : view.slice(4)
  return (
    <div className="appwin">
      <div className="appwin-bar">
        <button className="icon-btn ghost appwin-back" aria-label="Back" title="Back" onClick={() => pressKey(view, NAV.BACK)}>
          <Icon d={ICON.back} size={16} width={1.8} />
        </button>
        {pkg ? <Tile name={name} tone={slot >= 0 ? TONES[slot % TONES.length] : toneOf(pkg, [])} size={18} radius={6} font={10} />
          : <Logo size={16} />}
        <span className="appwin-name ellipsis">{name}</span>
        <span className="dot appwin-dot" title="Running" />
      </div>
      <div className="appwin-screen"><PhoneView view={view} flex={free} /></div>
    </div>
  )
}
