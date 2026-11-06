// Which shell layout fits (spec §6). landscape: the phone is wider than tall, so it takes the whole area and pages
// slide over it. compact: rail + docked phone + a 480 px pane don't fit, so pages slide over the phone too.
// A collapsed dock (52 px strip) never forces compact: the pane gets the room instead.
export type LayoutMode = 'split' | 'landscape' | 'compact'

const CHROME_H = 62 + 16 // title bar 36 + status bar 26, dock padding 16
const RAIL = 80
const PANE_MIN = 480

export function layoutMode(win: { w: number; h: number }, stream: { w: number; h: number } | null, dockOpen: boolean): LayoutMode {
  if (!dockOpen) return 'split'
  const s = stream ?? { w: 1080, h: 2400 }
  if (s.w > s.h) return 'landscape'
  const dockWidth = ((win.h - CHROME_H) * s.w) / s.h + 52 // screen + key toolbar and gaps
  return win.w < RAIL + dockWidth + PANE_MIN ? 'compact' : 'split'
}

// The stream shape the dock and the layout go by: only a live phone in the dock counts. Popped out or no phone,
// the last size is stale (a landscape one would make a huge empty dock), so they fall back to the default.
export function dockStream<T>(stream: T | null, ready: boolean, popped: boolean): T | null {
  return ready && !popped ? stream : null
}
