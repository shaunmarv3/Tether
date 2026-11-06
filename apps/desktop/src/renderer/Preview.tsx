import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties } from 'react'
import { sentence } from './text'
import { tether } from './tether'
import { EmptyState, ICON, Icon } from './ui'

// Root of a preview window (?preview=<file>&kind=image|video|audio|text&pos=3/444&folder=Download). The file is served by
// main over tether-preview:// from its preview folder. PDFs don't come here: they open in Chromium's PDF viewer.
export type PreviewKind = 'image' | 'video' | 'audio' | 'text'

const clock = (s: number) => {
  if (!Number.isFinite(s)) return '--:--'
  const t = Math.floor(s)
  const h = Math.floor(t / 3600)
  const mm = String(Math.floor((t % 3600) / 60)).padStart(h ? 2 : 1, '0')
  const ss = String(t % 60).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}
const MUTED = 'M4 9h4l5-4v14l-5-4H4zM16 9l5 6M21 9l-5 6'

// A thin track with a cream fill and a round thumb (AP-Windows).
function Range({ value, max, label, onChange, className }: {
  value: number; max: number; label: string; onChange: (v: number) => void; className?: string
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <input type="range" className={`pv-range ${className ?? ''}`} aria-label={label} min={0} max={max || 1} step="any" value={value}
      style={{ '--p': `${pct}%` } as CSSProperties} onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(Number(e.target.value))} />
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
  const play = (
    <button className="pv-play" aria-label={playing ? 'Pause' : 'Play'} onClick={toggle}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={playing ? 'M7 5h4v14H7zM13 5h4v14h-4z' : 'M8 5l11 7-11 7z'} /></svg>
    </button>
  )

  if (kind === 'audio') {
    return (
      <div className="pv-stage">
        {error ? <EmptyState boxed title="Can't play this file here" note="Save it to the PC and open it there." /> : (
          <div className="pv-audio">
            {play}
            <div className="grow">
              <div className="ellipsis pv-audio-name">{name}</div>
              <div className="mono muted pv-audio-time">Audio · {clock(time)} / {clock(dur)}</div>
              <Range label="Seek" value={time} max={Number.isFinite(dur) ? dur : 0} onChange={seek} />
            </div>
          </div>
        )}
        <audio ref={media} src={src} autoPlay {...events} />
      </div>
    )
  }
  return (
    <>
      <div className="pv-stage" ref={stage} onDoubleClick={full}>
        <video ref={media} className="pv-media" src={src} autoPlay onClick={toggle} {...events} />
        {error && <div className="pv-over"><EmptyState boxed title="Can't play this file here" note="Save it to the PC and open it there." /></div>}
      </div>
      <div className="pv-player" role="group" aria-label="Player">
        {play}
        <span className="mono">{clock(time)}</span>
        <Range className="pv-seek" label="Seek" value={time} max={Number.isFinite(dur) ? dur : 0} onChange={seek} />
        <span className="mono muted">{clock(dur)}</span>
        <button className="icon-btn ghost" aria-label={muted ? 'Unmute' : 'Mute'} title={muted ? 'Unmute' : 'Mute'}
          onClick={() => { media.current!.muted = !media.current!.muted }}>
          <Icon d={muted || vol === 0 ? MUTED : ICON.volume} size={16} />
        </button>
        <Range className="pv-volume" label="Volume" value={muted ? 0 : vol} max={1}
          onChange={(v) => { media.current!.volume = v; media.current!.muted = v === 0 }} />
        <button className="btn small" onClick={full}>Full screen</button>
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
      <div className={`pv-stage${actual ? ' scroll' : ''}`}>
        {error ? <EmptyState boxed title="Can't show this image here" note="Save it to the PC and open it there." />
          : <img className={`pv-media${actual ? ' actual' : ''}`} src={src} alt="" onClick={() => setActual(!actual)}
            onLoad={(e) => setSize(`${e.currentTarget.naturalWidth} × ${e.currentTarget.naturalHeight}`)} onError={() => setError(true)} />}
      </div>
      <div className="pv-player">
        <span className="mono muted">{size ?? '—'}</span>
        <span className="spacer" />
        <button className="btn small" onClick={() => setActual(!actual)}>{actual ? 'Fit' : 'Actual size'}</button>
      </div>
    </>
  )
}

function TextView({ src }: { src: string }) {
  const [text, setText] = useState<string | null>(null)
  useEffect(() => {
    void fetch(src).then((r) => r.text()).then((t) => setText(t.length > 2_000_000 ? `${t.slice(0, 2_000_000)}\n…` : t), () => setText('Could not read this file.'))
  }, [src])
  return text === null ? <div className="pv-stage"><EmptyState title="Reading…" kind="loading" /></div> : <pre className="pv-text">{text}</pre>
}

export function Preview({ name, kind, pos, folder }: { name: string; kind: PreviewKind; pos: string; folder: string }) {
  const src = `tether-preview://file/${encodeURIComponent(name)}`
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  const dot = name.lastIndexOf('.')
  const type = dot > 0 ? name.slice(dot + 1, dot + 5).toUpperCase() : kind
  const [n, of] = pos.split('/')
  const step = (delta: 1 | -1) => {
    if (busy || !pos) return
    setBusy(true)
    setError(false)
    tether.previewStep(delta).catch(() => setError(true)).finally(() => setBusy(false)) // success reloads this page
  }
  const save = () => {
    setSaved('Saving…')
    tether.previewSave().then((r) => setSaved(r.ok ? 'Saved to PC' : sentence(r.text)),
      (err) => setSaved(sentence(String((err as Error)?.message ?? err).replace(/^.*Error: /, ''))))
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
    <div className="appwin preview">
      <div className="appwin-bar pv-bar">
        <span className="chip pv-chip">{type}</span>
        <span className="appwin-name ellipsis">{name}</span>
        {pos && <span className="muted pv-pos">{busy ? 'Loading…' : error ? 'No phone' : `${n} of ${of}${folder ? ` in ${folder}` : ''}`}</span>}
        <span className="spacer" />
        {saved && <span className="muted pv-pos" role="status">{saved}</span>}
        {pos && (
          <>
            <button className="icon-btn ghost" aria-label="Previous file" title="Previous file" disabled={busy} onClick={() => step(-1)}><Icon d={ICON.back} size={16} width={1.8} /></button>
            <button className="icon-btn ghost" aria-label="Next file" title="Next file" disabled={busy} onClick={() => step(1)}><Icon d={ICON.next} size={16} width={1.8} /></button>
          </>
        )}
        <button className="btn primary small" disabled={saved === 'Saving…'} onClick={save}>Save to PC</button>
      </div>
      {kind === 'image' && <ImageView src={src} />}
      {(kind === 'video' || kind === 'audio') && <Player src={src} kind={kind} name={name} />}
      {kind === 'text' && <TextView src={src} />}
    </div>
  )
}
