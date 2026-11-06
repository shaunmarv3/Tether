import type { ViewId } from '../shared/api'
import { NAV, PhoneView, pressKey } from './PhoneView'

// Root of an app window: a slim draggable bar (Windows draws min/max/close over its right end) + the app's screen.
// Also the pop-out phone window (view 'mirror').
export function AppWindow({ view, name, free }: { view: ViewId; name: string; free: boolean }) {
  return (
    <div className="app-window">
      <div className="app-bar">
        <span className="led on" />
        <span className="app-bar-name">{name}</span>
        <button className="bar-key" onClick={() => pressKey(view, NAV.BACK)}>BACK</button>
      </div>
      <PhoneView view={view} flex={free} />
    </div>
  )
}
