import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { tether } from './tether'

// Root of a preview window (?preview=<file>&kind=image|video|audio|text&pos=3/444). The file is served by main over
// tether-preview:// from its preview folder. PDFs don't come here: they open in Chromium's PDF viewer.
export type PreviewKind = 'image' | 'video' | 'audio' | 'text'

const clock = (s: number) => {
  if (!Number.isFinite(s)) return '--:--'
  const t = Math.floor(s)
  const h = Math.floor(t / 3600)
  const mm = String(Math.floor((t % 3600) / 60)).padStart(2, '0')
  const ss = String(t % 60).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

function Icon({ d }: { d: string }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={d} /></svg>
}
const PLAY = 'M7 4.5v15l12-7.5z'
const PAUSE = 'M6 4h4v16H6zM14 4h4v16h-4z'
const SOUND = 'M4 9h4l5-4v14l-5-4H4zM16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12'
const MUTED = 'M4 9h4l5-4v14l-5-4H4zM16 9l5 6M21 9l-5 6'

// A slot-style slider: dark recessed track, amber fill, keycap thumb.
function Slot({ value, max, label, onChange, className }: {
  value: number; max: number; label: string; onChange: (v: number) => void; className?: string
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <input type="range" className={`slot-range ${className ?? ''}`} aria-label={label} min={0} max={max || 1} step="any" value={value}
      style={{ '--p': `${pct}%` } as React.CSSProperties} onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(Number(e.target.value))} />
  )
}

function Player({ src, kind, name }: { src: string; kind: 'video' | 'audio'; name: string }) {
  const media = useRef<HTMLVideoElement & HTMLAudioElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [dur, setDur] = useState(NaN)
  const [vol, setVol] = useState(1)
  const [muted, setMuted] = useState(false)
  const [error, setError] = useState(false)

  const toggle = () => {
    const m = media.current!
    if (m.paused) void m.play().catch(() => undefined)
    else m.pause()
  }
  const seek = (t: number) => { media.current!.currentTime = Math.max(0, Math.min(t, media.current!.duration || 0)) }
  const full = () => (document.fullscreenElement ? void document.exitFullscreen() : void stage.current?.requestFullscreen())

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const m = media.current
      if (!m) return
      if (e.key === ' ' || e.key === 'k') { e.preventDefault(); toggle() }
      else if (e.key === 'ArrowRight') seek(m.currentTime + 5)
      else if (e.key === 'ArrowLeft') seek(m.currentTime - 5)
      else if (e.key === 'm') m.muted = !m.muted
      else if (e.key === 'f' && kind === 'video') full()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const events = {
    onPlay: () => setPlaying(true), onPause: () => setPlaying(false), onEnded: () => setPlaying(false),
    onTimeUpdate: () => setTime(media.current!.currentTime), onDurationChange: () => setDur(media.current!.duration),
    onVolumeChange: () => { setVol(media.current!.volume); setMuted(media.current!.muted) },
    onError: () => setError(true),
  }

  return (
    <>
      <div className="preview-stage" ref={stage} onDoubleClick={kind === 'video' ? full : undefined}>
        {kind === 'video'
          ? <video ref={media} className="preview-media" src={src} autoPlay onClick={toggle} {...events} />
          : (
            <div className="lcd audio-lcd">
              <span className="dim tiny">AUDIO</span>
              <span className="audio-name">{name}</span>
              <span className="audio-time">{clock(time)}</span>
              <audio ref={media} src={src} autoPlay {...events} />
            </div>
          )}
        {error && <div className="screen-msg">CAN'T PLAY THIS FILE HERE · SAVE IT TO THE PC AND OPEN IT THERE</div>}
      </div>
      <div className="player-bar">
        <button className="key accent play-key" aria-label={playing ? 'Pause' : 'Play'} onClick={toggle}><Icon d={playing ? PAUSE : PLAY} /></button>
        <span className="lcd player-time">{clock(time)} / {clock(dur)}</span>
        <Slot className="seek" label="Seek" value={time} max={Number.isFinite(dur) ? dur : 0} onChange={seek} />
        <button className="key icon-key" aria-label={muted ? 'Unmute' : 'Mute'} onClick={() => { media.current!.muted = !media.current!.muted }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={muted || vol === 0 ? MUTED : SOUND} />
          </svg>
        </button>
        <Slot className="volume" label="Volume" value={muted ? 0 : vol} max={1}
          onChange={(v) => { media.current!.volume = v; media.current!.muted = v === 0 }} />
        {kind === 'video' && <button className="key bar-text-key" onClick={full}>FULL</button>}
      </div>
    </>
  )
}

function ImageView({ src }: { src: string }) {
  const [actual, setActual] = useState(false)
  const [size, setSize] = useState<string | null>(null)
  const [error, setError] = useState(false)
  return (
    <>
      <div className={`preview-stage ${actual ? 'scroll' : ''}`}>
        <img className={`preview-media ${actual ? 'actual' : ''}`} src={src} alt="" onClick={() => setActual(!actual)}
          onLoad={(e) => setSize(`${e.currentTarget.naturalWidth} × ${e.currentTarget.naturalHeight}`)} onError={() => setError(true)} />
        {error && <div className="screen-msg">CAN'T SHOW THIS IMAGE HERE · SAVE IT TO THE PC AND OPEN IT THERE</div>}
      </div>
      <div className="player-bar">
        <span className="lcd player-time">{size ?? '—'}</span>
        <span className="grow" />
        <button className="key bar-text-key" onClick={() => setActual(!actual)}>{actual ? 'FIT' : '1:1'}</button>
      </div>
    </>
  )
}

function TextView({ src }: { src: string }) {
  const [text, setText] = useState<string | null>(null)
  useEffect(() => {
    void fetch(src).then((r) => r.text()).then((t) => setText(t.length > 2_000_000 ? `${t.slice(0, 2_000_000)}\n…` : t), () => setText('COULD NOT READ THIS FILE'))
  }, [src])
  return <pre className="preview-text">{text ?? 'READING…'}</pre>
}

export function Preview({ name, kind, pos }: { name: string; kind: PreviewKind; pos: string }) {
  const src = `tether-preview://file/${encodeURIComponent(name)}`
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const step = (delta: 1 | -1) => {
    if (busy || !pos) return
    setBusy(true)
    setError(false)
    tether.previewStep(delta).catch(() => setError(true)).finally(() => setBusy(false)) // success reloads this page
  }
  // ← → step through photos; in a player they seek, so there PageUp / PageDown step.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'PageDown' || (kind === 'image' && e.key === 'ArrowRight')) step(1)
      if (e.key === 'PageUp' || (kind === 'image' && e.key === 'ArrowLeft')) step(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  return (
    <div className="app-window preview-window">
      <div className="app-bar">
        <span className={`led ${busy ? 'amber blink' : error ? 'red' : 'on'}`} />
        <span className="app-bar-name">{name}</span>
        {pos && (
          <>
            <button className="bar-key" aria-label="Previous" disabled={busy} onClick={() => step(-1)}>‹</button>
            <span className="mono tiny muted">{busy ? 'LOADING' : error ? 'NO PHONE' : pos.replace('/', ' / ')}</span>
            <button className="bar-key" aria-label="Next" disabled={busy} onClick={() => step(1)}>›</button>
          </>
        )}
      </div>
      {kind === 'image' && <ImageView src={src} />}
      {(kind === 'video' || kind === 'audio') && <Player src={src} kind={kind} name={name} />}
      {kind === 'text' && <TextView src={src} />}
    </div>
  )
}
