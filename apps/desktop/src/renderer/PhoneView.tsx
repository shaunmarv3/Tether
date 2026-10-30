import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from 'react'
import type { InputEvent, ViewId } from '../shared/api'
import { tether } from './tether'

export interface ViewInfo { width: number; height: number; fps: number }

// PC key → Android keycode. Printable characters go as text instead.
const KEYCODES: Record<string, number> = {
  Enter: 66, Backspace: 67, Tab: 61, Escape: 111, ArrowUp: 19, ArrowDown: 20, ArrowLeft: 21, ArrowRight: 22,
  Delete: 112, Home: 122, End: 123, PageUp: 92, PageDown: 93,
}
export const NAV = { BACK: 4, HOME: 3, RECENTS: 187 } as const

export function pressKey(view: ViewId, keycode: number): void {
  tether.input(view, { t: 'key', action: 0, keycode })
  tether.input(view, { t: 'key', action: 1, keycode })
}

const concat = (a: Uint8Array, b: Uint8Array) => {
  const out = new Uint8Array(a.length + b.length)
  out.set(a)
  out.set(b, a.length)
  return out
}

export function PhoneView({ view, keys, flex, bare, onInfo }: {
  view: ViewId; keys?: boolean; flex?: boolean; bare?: boolean; onInfo?: (info: ViewInfo | null) => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const size = useRef<{ w: number; h: number } | null>(null) // current session size: touches are sent in these pixels
  const down = useRef(false)
  const [live, setLive] = useState(false)
  const [closed, setClosed] = useState<string | null>(null) // error text; '' = closed on purpose
  const [attempt, setAttempt] = useState(0)
  const info = useRef(onInfo)
  info.current = onInfo

  useEffect(() => {
    const c = canvas.current!
    const ctx = c.getContext('2d')!
    let decoder: VideoDecoder | null = null
    let config: Uint8Array | null = null // prepended to the next frame (Annex-B: SPS/PPS travel in-band)
    let needKey = true
    let frames = 0
    let askedReset = 0
    // A broken decoder would freeze the picture: drop it and ask the phone for a fresh key frame (max every 2 s).
    const recover = () => {
      if (decoder && decoder.state !== 'closed') decoder.close()
      decoder = null
      if (Date.now() - askedReset < 2000) return
      askedReset = Date.now()
      tether.input(view, { t: 'reset' })
    }
    setLive(false)
    setClosed(null)

    const newDecoder = () => new VideoDecoder({
      output: (f) => {
        if (c.width !== f.displayWidth || c.height !== f.displayHeight) { c.width = f.displayWidth; c.height = f.displayHeight }
        ctx.drawImage(f, 0, 0)
        f.close()
        frames++
        setLive(true)
      },
      error: (e) => { console.warn('decoder error', e); recover() },
    })

    const off = tether.onVideo((id, m) => {
      if (id !== view) return
      if (m.kind === 'session') {
        size.current = { w: m.width, h: m.height }
      } else if (m.kind === 'config') {
        if (!decoder || decoder.state === 'closed') decoder = newDecoder()
        decoder.configure({ codec: m.codec, optimizeForLatency: true })
        config = m.data
        needKey = true
      } else if (m.kind === 'frame') {
        if (!decoder || decoder.state !== 'configured' || (needKey && !m.key)) return
        needKey = false
        const data = config ? concat(config, m.data) : m.data
        config = null
        try {
          decoder.decode(new EncodedVideoChunk({ type: m.key ? 'key' : 'delta', timestamp: m.pts, data }))
        } catch {
          recover()
        }
      } else {
        setClosed(m.error ?? '')
        setLive(false)
      }
    })
    const tick = setInterval(() => {
      info.current?.(size.current && frames ? { width: size.current.w, height: size.current.h, fps: frames } : null)
      frames = 0
    }, 1000)
    void tether.attach(view)
    return () => {
      off()
      clearInterval(tick)
      void tether.detach(view)
      if (decoder && decoder.state !== 'closed') decoder.close()
      info.current?.(null)
    }
  }, [view, attempt])

  // FREE shape: the phone's virtual display follows the window size.
  useEffect(() => {
    if (!flex || !box.current) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const even = (n: number) => Math.max(2, Math.round(n / 2) * 2)
    const ro = new ResizeObserver(([entry]) => {
      clearTimeout(timer)
      timer = setTimeout(() => tether.input(view, { t: 'resize', w: even(entry.contentRect.width), h: even(entry.contentRect.height) }), 200)
    })
    ro.observe(box.current)
    return () => { ro.disconnect(); clearTimeout(timer) }
  }, [view, flex])

  // Screen point → phone pixel (the canvas is letterboxed with object-fit: contain).
  const toPhone = (e: { clientX: number; clientY: number }) => {
    const s = size.current
    if (!s) return null
    const r = canvas.current!.getBoundingClientRect()
    const scale = Math.min(r.width / s.w, r.height / s.h)
    const x = Math.round((e.clientX - r.left - (r.width - s.w * scale) / 2) / scale)
    const y = Math.round((e.clientY - r.top - (r.height - s.h * scale) / 2) / scale)
    return { x: Math.min(Math.max(x, 0), s.w - 1), y: Math.min(Math.max(y, 0), s.h - 1), w: s.w, h: s.h, inside: x >= 0 && y >= 0 && x < s.w && y < s.h }
  }
  const send = (e: InputEvent) => tether.input(view, e)

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.focus()
    if (e.button === 2) return pressKey(view, NAV.BACK)
    if (e.button === 1) return pressKey(view, NAV.HOME)
    const p = toPhone(e)
    if (e.button !== 0 || !p?.inside) return
    e.currentTarget.setPointerCapture(e.pointerId)
    down.current = true
    send({ t: 'touch', action: 0, x: p.x, y: p.y, w: p.w, h: p.h })
  }
  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const p = down.current && toPhone(e)
    if (p) send({ t: 'touch', action: 2, x: p.x, y: p.y, w: p.w, h: p.h })
  }
  const onPointerUp = (e: PointerEvent<HTMLCanvasElement>) => {
    const p = down.current && toPhone(e)
    down.current = false
    if (p) send({ t: 'touch', action: 1, x: p.x, y: p.y, w: p.w, h: p.h })
  }
  const onWheel = (e: WheelEvent<HTMLCanvasElement>) => {
    const p = toPhone(e)
    const clamp = (n: number) => Math.min(16, Math.max(-16, n))
    if (p?.inside) send({ t: 'scroll', x: p.x, y: p.y, w: p.w, h: p.h, hs: clamp(-e.deltaX / 100), vs: clamp(-e.deltaY / 100) })
  }
  const onKey = (action: 0 | 1) => (e: KeyboardEvent<HTMLCanvasElement>) => {
    const code = KEYCODES[e.key]
    if (code !== undefined) {
      e.preventDefault()
      send({ t: 'key', action, keycode: code })
    } else if (action === 0 && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault()
      send({ t: 'text', text: e.key })
    }
  }

  return (
    <div className={`phone-view ${bare ? 'bare' : ''}`}>
      <div className="bezel" ref={box}>
        <canvas ref={canvas} className="phone-canvas" tabIndex={0} aria-label="Phone screen"
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
          onWheel={onWheel} onKeyDown={onKey(0)} onKeyUp={onKey(1)} onContextMenu={(e) => e.preventDefault()} />
        {!live && (
          <div className="screen-msg mono">
            {closed === null ? <span className="blink">CONNECTING…</span>
              : <>
                <span>{closed ? `PHONE VIEW CLOSED · ${closed.replace(/^(WARN|ERROR|INFO):\s*/, '').toUpperCase()}` : 'PHONE VIEW CLOSED'}</span>
                <button className="small-key" onClick={() => setAttempt((n) => n + 1)}>RECONNECT</button>
              </>}
          </div>
        )}
      </div>
      {keys && (
        <div className="phone-keys" role="group" aria-label="Phone keys">
          {(Object.keys(NAV) as (keyof typeof NAV)[]).map((k) => (
            <button key={k} className="key" onClick={() => pressKey(view, NAV[k])}>{k}</button>
          ))}
          <button className="key" onClick={() => tether.input(view, { t: 'rotate' })}>ROTATE</button>
        </div>
      )}
    </div>
  )
}
