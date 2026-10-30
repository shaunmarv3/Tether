import { useEffect, useState } from 'react'
import type { AppState, Clip, ClipSettings, WipeSeconds } from '../../shared/api'
import { tether } from '../tether'
import { errText, fmtSize } from './Files'

const WIPE: [WipeSeconds, string][] = [[30, '30 S'], [60, '60 S'], [120, '2 MIN']]

export const DIR_LABEL = { phone: 'PHONE → PC', pc: 'PC → PHONE' } as const

// Ticks once a second so ages and wipe countdowns stay current.
export function useNow(): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  return now
}

export function ago(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000))
  if (s < 60) return 'JUST NOW'
  if (s < 3600) return `${Math.floor(s / 60)} MIN AGO`
  return `${Math.floor(s / 3600)} H AGO`
}

export const wipeLeft = (c: Clip, now: number) => (c.wipeAt ? Math.max(0, Math.ceil((Date.parse(c.wipeAt) - now) / 1000)) : 0)

export function linkLine(state: AppState): string | null {
  if (state.clipLink === 'starting') return 'CONNECTING…'
  if (state.clipLink === 'error') return 'PHONE LINK LOST · RETRYING'
  if (state.clipLink === 'off') return 'NO PHONE'
  return null
}

function Switch({ label, on, set }: { label: string; on: boolean; set: (on: boolean) => void }) {
  return (
    <button className="setting" aria-pressed={on} onClick={() => set(!on)}>
      {label}<span className={`switch ${on ? 'on' : ''}`} />
    </button>
  )
}

export function Clipboard({ state }: { state: AppState }) {
  const now = useNow()
  const [error, setError] = useState<string | null>(null)
  const s = state.clipSettings
  const link = linkLine(state)
  const set = (patch: Partial<ClipSettings>) => void tether.setClipSettings({ ...s, ...patch })
  const run = (p: Promise<void>) => { setError(null); p.catch((err) => setError(errText(err))) }

  return (
    <main className="main">
      <header className="row between wrap end">
        <div className="col">
          <span className="mono small muted">{s.sync ? 'SYNC ON · BOTH WAYS' : 'SYNC OFF'}{link && ` · ${link}`}</span>
          <h1 className="headline">Copy here, <span className="accent-text">paste there.</span></h1>
        </div>
        <div className="row wrap">
          <button className="key tall" disabled={!state.clips.length} onClick={() => void tether.clearClips()}>CLEAR HISTORY</button>
          <button className={`key tall toggle-key ${s.sync ? 'pressed' : ''}`} aria-pressed={s.sync} onClick={() => set({ sync: !s.sync })}>
            SYNC<span className={`led ${s.sync ? 'on' : ''}`} />
          </button>
        </div>
      </header>

      <div className="clip-layout">
        <section className="clip-history" aria-labelledby="hist-h">
          <h2 id="hist-h" className="clip-head">HISTORY · TODAY</h2>
          {!state.clips.length && <div className="files-empty mono small muted">NOTHING COPIED YET · COPY ON EITHER SIDE</div>}
          {state.clips.map((c) => {
            const left = wipeLeft(c, now)
            const gone = c.note === 'WIPED'
            const tooBig = c.note === 'TOO BIG TO SEND'
            return (
              <div key={c.id} className={`clip-row ${c.secret ? 'secret' : ''}`}>
                <span className="dir-chip mono">{DIR_LABEL[c.dir]}</span>
                <div className="clip-body">
                  <span className="clip-text">{c.secret ? '●●●●●● ONE-TIME CODE' : c.text}</span>
                  <span className={`mono tiny ${c.secret && !gone ? 'amber-text' : 'muted'}`}>
                    {gone ? 'WIPED' : c.wipeAt ? `HIDDEN · WIPES IN ${left} S` : tooBig ? `TOO BIG TO SEND · ${fmtSize(c.size)}` : ago(c.at, now)}
                  </span>
                </div>
                <div className="row clip-keys">
                  <button className="small-key" disabled={gone} onClick={() => run(tether.copyClip(c.id))}>COPY</button>
                  <button className="small-key" disabled={gone || tooBig} onClick={() => run(tether.sendClip(c.id))}>
                    {c.dir === 'pc' ? 'RESEND' : 'SEND'}
                  </button>
                </div>
              </div>
            )
          })}
          {error && <div className="files-empty mono small danger-text" role="alert">{error}</div>}
        </section>

        <div className="clip-side">
          <div className="lcd clip-stats">
            <span className="dim tiny">TODAY</span>
            <div className="stat-grid">
              <div className="col tight"><span className="stat-big">{state.clipStats.synced}</span><span className="dim tiny">CLIPS SYNCED</span></div>
              <div className="col tight"><span className="stat-big">{state.clipStats.wiped}</span><span className="dim tiny">CODES WIPED</span></div>
            </div>
          </div>

          <section className="card" aria-labelledby="priv-h">
            <h2 id="priv-h" className="card-head">PRIVACY</h2>
            <div className="col toggles">
              <Switch label="Hide one-time codes" on={s.hideCodes} set={(hideCodes) => set({ hideCodes })} />
              <Switch label="Keep out of Windows clipboard history" on={s.keepOutOfHistory} set={(keepOutOfHistory) => set({ keepOutOfHistory })} />
            </div>
            <div className="col idle">
              <span className="mono tiny muted">WIPE CODES AFTER</span>
              <div className="segments three" role="group" aria-label="Wipe codes after">
                {WIPE.map(([sec, label]) => (
                  <button key={sec} className={`segment mono-seg ${s.wipeSeconds === sec ? 'on' : ''}`} aria-pressed={s.wipeSeconds === sec}
                    onClick={() => set({ wipeSeconds: sec })}>{label}</button>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
