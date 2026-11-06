import { useEffect, useRef, type ReactNode } from 'react'
import { ICON, Icon } from './ui'

// A page sliding in from the rail edge over the phone (landscape and small windows, AP-Landscape).
// Esc or the close button closes it; focus moves in on open and back to the rail on close.
export function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const box = useRef<HTMLElement>(null)
  useEffect(() => {
    box.current?.focus()
    return () => document.querySelector<HTMLElement>('.rail-item[aria-current="page"]')?.focus()
  }, [])
  return (
    <aside ref={box} className="drawer" aria-label={title} tabIndex={-1}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}>
      <div className="drawer-head">
        <h1>{title}</h1>
        <button className="icon-btn ghost" aria-label="Close" title="Close" onClick={onClose}>
          <Icon d={ICON.close} size={16} width={1.8} />
        </button>
      </div>
      {children}
    </aside>
  )
}
