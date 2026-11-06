// Logo C, "the t": a lowercase t whose stem runs out as a cable to a plug dot (AP-Logo).
// dark = for dark grounds, light = for light grounds, flat = one colour (currentColor).
export function Logo({ size = 16, tone = 'dark' }: { size?: number; tone?: 'dark' | 'light' | 'flat' }) {
  const [stem, bar, dot] = tone === 'dark' ? ['#FFB27A', '#F6E9DA', '#F6E9DA']
    : tone === 'light' ? ['#24100A', '#24100A', '#C2602F'] : ['currentColor', 'currentColor', 'currentColor']
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M24 6V40Q24 56 40 56H45" fill="none" stroke={stem} strokeWidth="10" strokeLinecap="round" />
      <path d="M12 22H40" stroke={bar} strokeWidth="10" strokeLinecap="round" />
      <circle cx="53" cy="56" r="6" fill={dot} />
    </svg>
  )
}
