import type { ViewId } from '../shared/api'
import { NAV, PhoneView, pressKey } from './PhoneView'

// Root of an app window: a slim draggable bar (Windows draws min/max/close over its right end) + the app's screen.
export function AppWindow({ pkg, name, free }: { pkg: string; name: string; free: boolean }) {
  const view: ViewId = `app:${pkg}`
  return (
    <div className="app-window">
      <div className="app-bar">
        <span className="led on" />
        <span className="app-bar-name">{name}</span>
        <button className="bar-key" onClick={() => pressKey(view, NAV.BACK)}>BACK</button>
      </div>
      <PhoneView view={view} flex={free} bare />
    </div>
  )
}
