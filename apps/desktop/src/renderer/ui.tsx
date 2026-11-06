import type { ReactNode } from 'react'

// Stroke icon paths from the Stage mockups (24×24, 1.7 px stroke).
export const ICON = {
  home: 'M4 11l8-7 8 7v9H4z',
  apps: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  files: 'M3 6h6l2 2h10v11H3z',
  clip: 'M8 4h8v3H8zM6 5H5v16h14V5h-1',
  bell: 'M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 21h4',
  pilot: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6zM3 12h6M15 12h6M12 15v6',
  layouts: 'M3 4h18v16H3zM9 4v16M9 12h12',
  shield: 'M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z',
  lock: 'M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3',
  back: 'M15 18l-6-6 6-6',
  next: 'M9 18l6-6-6-6',
  navHome: 'M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10z',
  recents: 'M6 6h12v12H6z',
  rotate: 'M4 12a8 8 0 0 1 14-5.3M20 4v4h-4M20 12a8 8 0 0 1-14 5.3M4 20v-4h4',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 9.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7z',
  record: 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16zM12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z',
  paste: 'M8 4h8v3H8zM6 5H5v16h14V5h-1M9 13h6M12 10v6',
  moon: 'M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z',
  popout: 'M14 4h6v6M20 4l-8 8M18 14v6H4V6h6',
  collapse: 'M15 18l-6-6 6-6M20 4v16',
  expand: 'M9 18l6-6-6-6M4 4v16',
  close: 'M6 6l12 12M18 6L6 18',
  up: 'M12 19V5M6 11l6-6 6 6',
  download: 'M12 5v11M7 11l5 5 5-5M4 19h16',
  warn: 'M12 3l9 16H3zM12 10v4M12 17h.01',
  check: 'M5 12l5 5 9-10',
  play: 'M8 5v14l11-7z',
  pause: 'M8 5v14M16 5v14',
  volume: 'M4 9h4l5-4v14l-5-4H4zM16 9a4 4 0 0 1 0 6',
  full: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
} as const

export function Icon({ d, size = 18, stroke = 'currentColor', width = 1.7 }: { d: string; size?: number; stroke?: string; width?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={width}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

export function Switch({ label, on, set, disabled }: { label: string; on: boolean; set: (on: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" className="switch" aria-checked={on} aria-label={label} title={label}
      disabled={disabled} onClick={() => set(!on)} />
  )
}

export function Segmented<T extends string | number>({ label, options, value, set, full }: {
  label: string; options: [T, string][]; value: T; set: (v: T) => void; full?: boolean
}) {
  return (
    <div role="group" aria-label={label} className={`seg${full ? ' full' : ''}`}>
      {options.map(([v, text]) => (
        <button key={String(v)} type="button" aria-pressed={v === value} onClick={() => set(v)}>{text}</button>
      ))}
    </div>
  )
}

export function Kbd({ keys }: { keys: string[] }) {
  return <span className="kbds">{keys.map((k) => <kbd key={k} className="kbd">{k}</kbd>)}</span>
}

const PHONE_MARK = (
  <svg width="40" height="40" viewBox="0 0 64 64" aria-hidden="true">
    <rect x="16" y="6" width="26" height="40" rx="7" fill="none" stroke="var(--muted)" strokeWidth="3" />
    <path d="M29 46V50Q29 57 37 57H45" fill="none" stroke="var(--muted)" strokeWidth="3" strokeLinecap="round" strokeDasharray="3 4" />
  </svg>
)

export function EmptyState({ title, note, kind = 'plain', boxed, children }: {
  title: string; note?: ReactNode; kind?: 'phone' | 'wait' | 'loading' | 'plain'; boxed?: boolean; children?: ReactNode
}) {
  if (kind === 'loading') {
    return (
      <div className={`empty${boxed ? ' boxed' : ''}`} role="status" aria-label={title}>
        <div className="skeleton">
          <span className="empty-note">{title}</span>
          <i style={{ width: '80%' }} /><i style={{ width: '60%' }} /><i style={{ width: '70%' }} />
        </div>
      </div>
    )
  }
  return (
    <div className={`empty${boxed ? ' boxed' : ''}`} role="status">
      {kind === 'phone' && PHONE_MARK}
      {kind === 'wait' && <span className="wait-dot" />}
      <span className="empty-title">{title}</span>
      {note && <span className="empty-note">{note}</span>}
      {children}
    </div>
  )
}

// The 8 warm tile tones for app letter tiles: [background, letter] (spec §4, AP-Home).
export const TONES: [string, string][] = [
  ['#FFB27A', '#24100A'], ['#F6E9DA', '#24100A'], ['#E07A52', '#F6E9DA'], ['#C99A6B', '#24100A'],
  ['#8F4A2E', '#F6E9DA'], ['#F2C9A0', '#24100A'], ['#5E2E1C', '#F6E9DA'], ['#D9B48F', '#24100A'],
]
// Pinned apps take the tone of their pin slot (Home shows 8 different ones); others a stable one from the package name.
export function toneOf(pkg: string, pins: { pkg: string }[]): [string, string] {
  const i = pins.findIndex((p) => p.pkg === pkg)
  if (i >= 0) return TONES[i % TONES.length]
  let h = 0
  for (const c of pkg) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return TONES[h % TONES.length]
}

export function Tile({ name, tone, size = 42, radius = 13, font = 18, className }: {
  name: string; tone: [string, string]; size?: number; radius?: number; font?: number; className?: string
}) {
  return (
    <span className={`tile${className ? ` ${className}` : ''}`} aria-hidden="true"
      style={{ width: size, height: size, borderRadius: radius, fontSize: font, background: tone[0], color: tone[1] }}>
      {name.charAt(0).toUpperCase()}
    </span>
  )
}
