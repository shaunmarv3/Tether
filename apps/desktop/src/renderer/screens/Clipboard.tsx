import { useEffect, useState } from 'react'
import type { AppState, Clip, ClipSettings, WipeSeconds } from '../../shared/api'
import { sentence } from '../text'
import { tether } from '../tether'
import { EmptyState, Segmented, Switch as Toggle } from '../ui'
import { errText, fmtSize } from './Files'

const WIPE: [WipeSeconds, string][] = [[30, '30 s'], [60, '60 s'], [120, '2 min']]

export const DIR_LABEL = { phone: 'Phone → PC', pc: 'PC → Phone' } as const

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
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  return `${Math.floor(s / 3600)} h ago`
}

export const wipeLeft = (c: Clip, now: number) => (c.wipeAt ? Math.max(0, Math.ceil((Date.parse(c.wipeAt) - now) / 1000)) : 0)

export function linkLine(state: AppState): string | null {
  if (state.clipLink === 'starting') return 'connecting…'
  if (state.clipLink === 'error') return 'phone link lost, retrying'
  if (state.clipLink === 'off') return 'no phone'
  return null
}

export function Clipboard({ state }: { state: AppState }) {
  const now = useNow()
  const [error, setError] = useState<string | null>(null)
  const s = state.clipSettings
  const link = linkLine(state)
  const set = (patch: Partial<ClipSettings>) => void tether.setClipSettings({ ...s, ...patch })
  const run = (p: Promise<void>) => { setError(null); p.catch((err) => setError(sentence(errText(err)))) }

  return (
    <div className="page">
      <div className="pane-toolbar" role="toolbar" aria-label="Clipboard">
        <h1>Clipboard</h1>
        <span className="hint">{s.sync ? 'Copy on one side, paste on the other' : 'Sync is off'}{link && ` · ${link}`}</span>
        <span className="spacer" />
        <button className="btn mid" disabled={!state.clips.length} onClick={() => void tether.clearClips()}>Clear history</button>
        <span className="clip-sync">Sync<Toggle label="Sync both ways" on={s.sync} set={(sync) => set({ sync })} /></span>
      </div>

      <div className="pane-body">
        <section className="pane-scroll" aria-label="History, today">
          {!state.clips.length && <EmptyState title="Nothing copied yet" note="Copy on either side and it shows here" />}
          <div className="row-list">
            {state.clips.map((c) => {
              const left = wipeLeft(c, now)
              const gone = c.note === 'WIPED'
              const tooBig = c.note === 'TOO BIG TO SEND'
              const image = c.note === 'IMAGE'
              return (
                <div key={c.id} className={`row clip-row${gone ? ' wiped' : ''}`}>
                  <span className="chip clip-dir">{DIR_LABEL[c.dir]}</span>
                  <div className="grow">
                    <div className="ellipsis clip-text">{c.secret ? (gone ? 'One-time code' : 'One-time code, hidden') : image ? 'Screenshot' : c.text}</div>
                    <div className={`mono clip-meta${c.secret && !gone ? ' accent' : ''}`}>
                      {gone ? 'Wiped' : c.wipeAt ? `Hidden · wipes in ${left} s` : tooBig ? `Too big to send · ${fmtSize(c.size)}`
                        : image ? `Image · on the PC clipboard · ${fmtSize(c.size)} · ${ago(c.at, now)}` : ago(c.at, now)}
                    </div>
                  </div>
                  {!image && (
                    <div className="clip-keys">
                      <button className="btn small" disabled={gone} onClick={() => run(tether.copyClip(c.id))}>Copy</button>
                      <button className="btn small" disabled={gone || tooBig} onClick={() => run(tether.sendClip(c.id))}>
                        {c.dir === 'pc' ? 'Resend' : 'Send'}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          {error && <div className="error-text page-error" role="alert">{error}</div>}
        </section>

        <aside className="inspector" aria-label="Today and privacy">
          <div className="stat-pair">
            <div><div className="big-num">{state.clipStats.synced}</div><div className="stat-label">Clips synced today</div></div>
            <div><div className="big-num">{state.clipStats.wiped}</div><div className="stat-label">Codes wiped</div></div>
          </div>
          <div>
            <h2 className="section-title">Privacy</h2>
            <div className="switch-row">Hide one-time codes<Toggle label="Hide one-time codes" on={s.hideCodes} set={(hideCodes) => set({ hideCodes })} /></div>
            <div className="switch-row">Phone screenshots to PC clipboard
              <Toggle label="Phone screenshots to PC clipboard" on={s.screenshots} set={(screenshots) => set({ screenshots })} /></div>
            <div className="switch-row">Keep out of Windows clipboard history
              <Toggle label="Keep out of Windows clipboard history" on={s.keepOutOfHistory} set={(keepOutOfHistory) => set({ keepOutOfHistory })} /></div>
          </div>
          <div>
            <div className="section-title apps-label">Wipe one-time codes after</div>
            <Segmented label="Wipe codes after" full value={s.wipeSeconds} set={(wipeSeconds) => set({ wipeSeconds })} options={WIPE} />
          </div>
        </aside>
      </div>
    </div>
  )
}
