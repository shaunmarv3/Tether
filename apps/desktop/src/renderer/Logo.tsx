// TETHER mark: PC and phone as two nodes on one cable, an amber packet on the line.
// Same drawing as the app icon (resources/icon.svg).
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="8" cy="24" r="4" stroke="var(--accent)" strokeWidth="2.4" />
      <circle cx="24" cy="8" r="4" stroke="var(--accent)" strokeWidth="2.4" />
      <path d="M10.9 21.1C15.5 19.6 12 12.4 21.1 10.9" stroke="var(--text)" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="14.3" cy="16" r="1.7" fill="var(--amber)" />
    </svg>
  )
}
