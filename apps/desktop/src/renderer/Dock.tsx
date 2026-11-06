import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { AppState } from '../shared/api'
import { phoneAudioStream } from './audio'
import { NAV, PhoneView, pressKey, type ViewInfo } from './PhoneView'
import { errText } from './screens/Files'
import type { LayoutMode } from './layout'
import type { Toast } from './Shell'
import { sentence } from './text'
import { tether } from './tether'
import { EmptyState, ICON, Icon } from './ui'

// Spike C (2026-10-30): Electron records H.264 + AAC MP4 straight from the canvas.
const MIME = 'video/mp4;codecs=avc1,mp4a.40.2'
export const failed = (err: unknown): Toast => ({ text: sentence(errText(err)), kind: 'error' })

export interface Recorder { startedAt: number | null; start(canvas: HTMLCanvasElement): void; stop(): void }

// Records the dock's canvas (+ phone sound). Stopping saves the file; the result shows as a toast.
// Locking stops it too: main refuses saves while locked, so the file is saved right after the unlock.
export function useRecorder(locked: boolean, notify: (t: Toast) => void): Recorder {
  const rec = useRef<MediaRecorder | null>(null)
  const pending = useRef<Blob | null>(null)
  const isLocked = useRef(locked)
  isLocked.current = locked
  const [startedAt, setStartedAt] = useState<number | null>(null)

  const save = async (blob: Blob) => {
    notify({ text: 'Saving the recording…', kind: 'busy' })
    try {
      await tether.saveRecording(await blob.arrayBuffer())
      notify({ text: 'Recording saved', kind: 'ok', action: ['Open folder', () => void tether.openSaveFolder()] })
    } catch (err) {
      notify(failed(err))
    }
  }
  useEffect(() => {
    if (locked || !pending.current) return
    const blob = pending.current
    pending.current = null
    void save(blob)
  }, [locked])

  const start = (canvas: HTMLCanvasElement) => {
    if (rec.current) return
    const tracks = [...canvas.captureStream(30).getVideoTracks(), ...(phoneAudioStream()?.getAudioTracks() ?? [])]
    const r = new MediaRecorder(new MediaStream(tracks), { mimeType: MIME, videoBitsPerSecond: 8_000_000 })
    const parts: Blob[] = []
    r.ondataavailable = (e) => { if (e.data.size) parts.push(e.data) }
    r.onstop = () => {
      const blob = new Blob(parts, { type: 'video/mp4' })
      if (isLocked.current) pending.current = blob
      else void save(blob)
    }
    r.start(1000)
    rec.current = r
    setStartedAt(Date.now())
  }
  const stop = () => {
    rec.current?.stop()
    rec.current = null
    setStartedAt(null)
  }
  useEffect(() => () => { rec.current?.stop() }, [])
  return { startedAt, start, stop }
}

function phoneState(state: AppState): { title: string; note: string; kind: 'phone' | 'wait' | 'loading' } | null {
  const d = state.device
  if (!d) return state.unknown.length
    ? { title: 'New phone', note: 'Trust it to connect', kind: 'wait' }
    : { title: 'No phone', note: 'Plug in a USB cable', kind: 'phone' }
  if (d.state === 'unauthorized') return { title: 'Check your phone', note: 'Tap Allow on “Allow USB debugging?”', kind: 'wait' }
  if (d.state !== 'device') return { title: 'Phone offline', note: 'Replug the cable', kind: 'phone' }
  return null
}

// The phone at full window height, with its key toolbar (spec §6). Collapsed = a 52 px strip.
export function Dock({ state, mode, open, setOpen, visible, info, stream, onInfo, recorder, notify }: {
  state: AppState; mode: LayoutMode; open: boolean; setOpen: (open: boolean) => void; visible: boolean; info: ViewInfo | null
  stream: { w: number; h: number } | null // last known stream size: keeps the shape while (re)connecting
  onInfo: (info: ViewInfo | null) => void; recorder: Recorder; notify: (t: Toast) => void
}) {
  const screen = useRef<HTMLDivElement>(null)
  const ready = state.device?.state === 'device'
  const showing = ready && open && visible
  const live = showing && !!info
  const driving = state.pilot.current?.status === 'running' || state.pilot.current?.status === 'waiting'
  const empty = phoneState(state)

  // Collapsing, hiding the window or losing the phone ends the stream, and a recording with it (it gets saved).
  useEffect(() => { if (!showing) recorder.stop() }, [showing])
  useEffect(() => () => recorder.stop(), [])

  if (!open) {
    return (
      <section className="dock collapsed" aria-label="Phone, collapsed">
        <button className="dock-expand" aria-label="Show the phone" title="Show the phone" onClick={() => setOpen(true)}>
          <Icon d={ICON.next} size={16} />
        </button>
        <span className={`status-dot${ready ? ' on' : ''}`} title={ready ? 'Phone connected' : 'No phone'} />
      </section>
    )
  }

  const act = (p: Promise<void>, done: Toast) => { p.then(() => notify(done), (err) => notify(failed(err))) }
  const record = () => {
    if (recorder.startedAt !== null) return recorder.stop()
    const canvas = screen.current?.querySelector('canvas')
    if (canvas) recorder.start(canvas)
  }
  const keys: [string, string, (() => void) | null, boolean?][] = [
    ['Back', ICON.back, () => pressKey('mirror', NAV.BACK)],
    ['Home', ICON.navHome, () => pressKey('mirror', NAV.HOME)],
    ['Recent apps', ICON.recents, () => pressKey('mirror', NAV.RECENTS)],
    ['Rotate', ICON.rotate, () => tether.input('mirror', { t: 'rotate' })],
    ['Screenshot', ICON.camera, () => act(tether.screenshot(), { text: 'Screenshot saved', kind: 'ok', action: ['Open folder', () => void tether.openSaveFolder()] })],
    [recorder.startedAt !== null ? 'Stop recording' : 'Record', ICON.record, record, recorder.startedAt !== null],
    ['Paste to phone', ICON.paste, () => act(tether.pasteToPhone(), { text: 'Pasted on the phone', kind: 'ok' })],
    ['Screen off', ICON.moon, () => act(tether.screenOff(), { text: 'Screen off', kind: 'ok' })],
  ]
  const s = stream ?? { w: 1080, h: 2400 }
  const shape = { aspectRatio: `${s.w} / ${s.h}`, '--ar': s.w / s.h } as CSSProperties

  return (
    <section className={`dock${mode === 'landscape' ? ' wide' : mode === 'compact' ? ' narrow' : ''}`}
      aria-label={mode === 'landscape' ? 'Phone screen, landscape' : 'Phone screen'}>
      <div ref={screen} className={`dock-screen${driving ? ' driving' : ''}`} style={shape}>
        {ready
          ? visible && <PhoneView view="mirror" onInfo={onInfo} />
          : empty && <EmptyState title={empty.title} note={empty.note} kind={empty.kind} />}
      </div>
      <div className="key-toolbar" role="toolbar" aria-label="Phone keys">
        {keys.map(([label, d, run, on], i) => (
          <button key={label} className={`key-btn${on ? ' on' : ''}${i === 4 ? ' gap' : ''}`} aria-label={label} title={label}
            disabled={!ready || (i === 5 ? !live : i < 4 && !showing)} onClick={run ?? undefined}>
            <Icon d={d} size={18} />
          </button>
        ))}
        <button className="key-btn gap" aria-label="Hide the phone" title="Hide the phone" onClick={() => setOpen(false)}>
          <Icon d={ICON.collapse} size={18} />
        </button>
      </div>
    </section>
  )
}
