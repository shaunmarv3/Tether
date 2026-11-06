import { useEffect, useState } from 'react'
import { tether } from './tether'

// The apps' real icons (data: URLs), shared by every page. Asked once per package while a phone is ready;
// main keeps them on the PC, so later starts are instant. No icon = the letter tile stays.
const cache = new Map<string, string>()
const asked = new Set<string>()
const subs = new Set<() => void>()

export function useIcons(pkgs: string[], ready: boolean): Map<string, string> {
  const [, tick] = useState(0)
  useEffect(() => {
    const sub = () => tick((n) => n + 1)
    subs.add(sub)
    return () => { subs.delete(sub) }
  }, [])
  const key = pkgs.join(',')
  useEffect(() => {
    if (!ready) return
    const want = pkgs.filter((p) => !asked.has(p))
    if (!want.length) return
    for (const p of want) asked.add(p)
    tether.appIcons(want).then((icons) => {
      for (const [pkg, url] of Object.entries(icons)) cache.set(pkg, url)
      for (const f of subs) f()
    }, () => { for (const p of want) asked.delete(p) })
  }, [key, ready])
  return cache
}
