import { useEffect, useRef, useState } from 'react'
import type { AppState } from '../../shared/api'
import { phoneAudioStream } from '../audio'
import { PhoneView, type ViewInfo } from '../PhoneView'
import { tether } from '../tether'
import { useNow } from './Clipboard'
import { errText } from './Files'

// Spike C (2026-10-30): Electron records H.264 + AAC MP4 straight from the canvas.
const MIME = 'video/mp4;codecs=avc1,mp4a.40.2'
const clock = (ms: number) => {
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function Mirror({ state, recordAsked, clearRecordAsk }: { state: AppState; recordAsked: boolean; clearRecordAsk: () => void }) {
  const [info, setInfo] = useState<ViewInfo | null>(null)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [saved, setSaved] = useState<{ text: string; error: boolean } | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const page = useRef<HTMLElement>(null)
  const now = useNow()
  const ready = state.device?.state === 'device'
  const ai = state.pilot.current?.status === 'running' ? state.pilot.current : null

  function start() {
    const canvas = page.current?.querySelector('canvas')
    if (!canvas || recorder.current) return
    const tracks = [...canvas.captureStream(30).getVideoTracks(), ...(phoneAudioStream()?.getAudioTracks() ?? [])]
    const r = new MediaRecorder(new MediaStream(tracks), { mimeType: MIME, videoBitsPerSecond: 8_000_000 })
    const parts: Blob[] = []
    r.ondataavailable = (e) => { if (e.data.size) parts.push(e.data) }
    r.onstop = async () => {
      setSaved({ text: 'SAVING…', error: false })
      try {
        await tether.saveRecording(await new Blob(parts, { type: 'video/mp4' }).arrayBuffer())
        setSaved({ text: 'SAVED', error: false })
      } catch (err) {
        setSaved({ text: errText(err), error: true })
      }
    }
    r.start(1000)
    recorder.current = r
    setSaved(null)
    setStartedAt(Date.now())
  }

  function stop() {
    recorder.current?.stop()
    recorder.current = null
    setStartedAt(null)
  }

  // RECORD on Home opens this page: start once the picture is live.
  useEffect(() => {
    if (recordAsked && info) { clearRecordAsk(); start() }
  }, [recordAsked, info])
  useEffect(() => () => { recorder.current?.stop() }, []) // leaving the page saves what was recorded

  return (
    <main className={`main mirror-page ${ai ? 'driving' : ''}`} ref={page}>
      <header className="row between wrap end">
        <div className="col">
          <span className="mono tiny muted">{info ? `LIVE · ${info.width}×${info.height} · ${info.fps} FPS` : 'PHONE SCREEN'}</span>
          <h1 className="headline">Your phone, <span className="accent-text">right here.</span></h1>
        </div>
        {ready && (
          <div className="row">
            {startedAt !== null ? (
              <>
                <span className="mono small rec-line"><span className="led rec blink" />REC {clock(now - startedAt)}</span>
                <button className="key" onClick={stop}>STOP</button>
              </>
            ) : (
              <>
                {saved && (
                  <span className={`mono small ${saved.error ? 'danger-text' : 'accent-text'}`} role="status">{saved.text}</span>
                )}
                {saved?.text === 'SAVED' && <button className="key" onClick={() => void tether.openSaveFolder()}>OPEN FOLDER</button>}
                <button className="key" disabled={!info} onClick={start}><span className="led rec" />RECORD</button>
              </>
            )}
          </div>
        )}
      </header>
      {ai && (
        <div className="pilot-strip" role="status">
          <span className="led amber blink" />
          <span className="mono small amber-text">AI</span>
          <span className="grow pilot-step">{ai.log[0]?.text ?? ai.goal}</span>
          <span className="mono tiny muted">STEP {ai.log.filter((s) => s.verdict !== 'blocked').length} / 40</span>
          <button className="small-key pilot-strip-stop" onClick={() => void tether.pilotStop()}>STOP</button>
        </div>
      )}
      {ready
        ? <PhoneView view="mirror" keys onInfo={setInfo} />
        : <section className="lcd status"><div className="lcd-title">NO PHONE · PLUG IN A USB CABLE</div></section>}
    </main>
  )
}
