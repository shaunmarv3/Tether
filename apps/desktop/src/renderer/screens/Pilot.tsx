import { useEffect, useState } from 'react'
import type { AppState, PilotQuestion, PilotTaskView } from '../../shared/api'
import { PhoneView } from '../PhoneView'
import { sentence } from '../text'
import { tether } from '../tether'
import { EmptyState, Kbd, Switch } from '../ui'
import { useNow } from './Clipboard'
import { errText } from './Files'

const QUESTION_S = 120 // main answers NO after this
const STATUS: Record<PilotTaskView['status'], string> = {
  waiting: 'Waiting for your OK', running: 'Running', denied: 'You said no', stopped: 'Stopped', done: 'Done',
}
const RESULT = { ok: ['Allowed', 'muted'], asked: ['Asking you', 'accent'], blocked: ['Blocked', 'bad'] } as const
const doneSteps = (t: PilotTaskView) => t.log.filter((s) => s.verdict !== 'blocked').length
export const stepLine = (t: PilotTaskView) => `step ${doneSteps(t)}${t.to ? '' : ' / 200'}`
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

function askTitle(q: PilotQuestion, react: boolean): string {
  if (q.kind === 'plan') return 'Start this task?'
  if (q.kind === 'question') return q.message ?? 'Claude asks you'
  if (q.kind === 'unlock') return `${q.app} is locked`
  if (react) return q.to ? `React to ${q.to}'s message?` : 'React to this message?'
  if (q.kind === 'send') return 'Send this message?'
  if (q.why === 'SETTINGS') return 'Change settings?'
  if (q.why === 'SYSTEM DIALOG') return 'Answer a system popup?'
  if (q.why === 'SYSTEM PANEL') return 'Tap in system panels?'
  if (q.why === 'POPUP') return 'Tap in a popup?'
  if (q.why.includes('WITHOUT SCREEN TEXT')) return `${sentence(q.why)}?`
  return `Tap ${sentence(q.why)}?`
}

// The plan/send/risky/unlock/question dialog, over everything. The "no" button has focus so a stray Enter never says yes.
export function PilotAsk({ q }: { q: PilotQuestion }) {
  const now = useNow()
  const [since, setSince] = useState(Date.now())
  const start = q.kind === 'question' ? '' : q.message ?? '' // a question starts with an empty answer box
  const [text, setText] = useState(start)
  useEffect(() => { setSince(Date.now()); setText(start) }, [q.id])
  const left = Math.max(0, QUESTION_S - Math.floor((now - since) / 1000))
  const react = q.kind === 'send' && q.why === 'REACT'
  const editable = q.kind === 'send' && !react
  const typed = editable || q.kind === 'question'
  const answer = (yes: boolean) => void tether.pilotAnswer(q.id, yes, typed && yes ? text : undefined)
  const [no, yes] = q.kind === 'plan' ? ['Deny', 'Allow'] : q.kind === 'unlock' ? ['Stop task', 'Done'] : q.kind === 'question' ? ['Skip', 'Answer']
    : react ? ["Don't react", 'React'] : q.kind === 'send' ? ["Don't send", 'Send'] : ['No', 'Yes']

  return (
    <div className="ask-scrim" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); answer(false) } }}>
      <div className="ask" role="alertdialog" aria-modal="true" aria-labelledby="ask-title">
        <div className="ask-head">
          <span className="ask-kicker">AI Pilot needs you</span>
          <span className="mono">No in {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span>
        </div>
        <h2 id="ask-title" className="ask-title">{askTitle(q, react)}</h2>

        {q.task && (
          <>
            <p className="ask-goal">{q.task.goal}</p>
            <ol className="ask-plan">{q.task.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
            <dl className="ask-facts">
              <dt>Apps</dt><dd>{q.task.apps.join(', ')}</dd>
              {q.task.to && <><dt>Messages to</dt><dd>{q.task.to}</dd></>}
            </dl>
          </>
        )}
        {react && (
          <>
            <div className="ask-box ask-react"><span className="ask-emoji">{q.message}</span></div>
            <dl className="ask-facts">
              <dt>Chat</dt><dd>{q.to ?? <span className="ask-bad">Can't read it</span>}<span className="ask-from">, read from the phone screen</span></dd>
              <dt>App</dt><dd>{q.app}</dd>
            </dl>
          </>
        )}
        {editable && (
          <>
            <dl className="ask-facts">
              <dt>To</dt><dd>{q.to ?? <span className="ask-bad">Can't read it</span>}<span className="ask-from">, read from the phone screen</span></dd>
              <dt>App</dt><dd>{q.app}</dd>
            </dl>
            <label htmlFor="ask-msg" className="ask-label">Message. Edit it if you like, this is exactly what gets sent.</label>
            <textarea id="ask-msg" className="ask-text" value={text} maxLength={1000} rows={3} onChange={(e) => setText(e.target.value)} />
          </>
        )}
        {q.kind === 'risky' && (
          <>
            <p className="ask-note">
              {q.why === 'POPUP' ? "Tether can't read this popup (like WhatsApp's reaction row). Check the ring: that's exactly where it taps."
                : 'Deletes, installs and settings always ask.' + (q.shot ? ' The ring shows exactly where it taps.' : '')}
            </p>
            <dl className="ask-facts"><dt>App</dt><dd>{q.app}</dd></dl>
          </>
        )}
        {q.shot && (
          <div className="ask-shot">
            <img src={`data:image/jpeg;base64,${q.shot.data}`} alt="Phone screen, the ring marks the tap" />
            <span className="ask-ring" style={{ left: `${q.shot.x * 100}%`, top: `${q.shot.y * 100}%` }} />
          </div>
        )}
        {q.kind === 'question' && (
          <>
            <label htmlFor="ask-answer" className="ask-label">Your answer. Claude uses only what you type here; Skip means it won't guess.</label>
            <textarea id="ask-answer" className="ask-text" value={text} maxLength={1000} rows={3} placeholder="Your answer…"
              onChange={(e) => setText(e.target.value)} />
          </>
        )}
        {q.kind === 'unlock' && <p className="ask-note">Unlock it on your phone, then press Done. The AI waits and never types your PIN or password.</p>}

        <div className="ask-buttons">
          <button className="ask-no" autoFocus onClick={() => answer(false)}>{no} <span className="mono ask-esc">Esc</span></button>
          <button className="ask-yes" disabled={typed && !text.trim()} onClick={() => answer(true)}>{yes}</button>
        </div>
      </div>
    </div>
  )
}

// While the AI drives and the dock is collapsed, the phone stays in view in a corner (user, 2026-11-01).
export function PilotPip({ ai, open }: { ai: PilotTaskView; open: () => void }) {
  return (
    <aside className="pip" aria-label="Phone screen while the AI drives">
      <div className="pip-head">
        <button className="pip-open" onClick={open} title="Show the phone">AI · {stepLine(ai)}</button>
        <button className="pip-stop" onClick={() => void tether.pilotStop()}>Stop</button>
      </div>
      <div className="pip-screen"><PhoneView view="mirror" /></div>
    </aside>
  )
}

export function Pilot({ state }: { state: AppState }) {
  const [error, setError] = useState<string | null>(null)
  const { connected, command, current: t, past, askSends } = state.pilot
  const run = (p: Promise<void>) => { setError(null); p.catch((err) => setError(errText(err))) }
  const claude = connected === true ? 'Claude Code connected' : connected === false ? 'Claude Code not connected'
    : command ? 'Connect Claude Code by hand' : 'Looking for Claude Code…'

  return (
    <div className="page">
      <div className="pane-toolbar" role="toolbar" aria-label="AI Pilot">
        <h1>AI Pilot</h1>
        <span className="hint">{claude}</span>
      </div>

      <div className="pane-body pilot">
        <section className="pane-scroll pilot-task" aria-labelledby="p-task">
          <h2 id="p-task" className="section-title">{t ? `Current task · ${STATUS[t.status].toLowerCase()}` : 'Current task'}</h2>
          {t ? (
            <>
              <p className="pilot-goal">{t.goal}</p>
              <p className="muted pilot-sub">
                Apps: {t.apps.join(', ')}{t.to && ` · Messages only to ${t.to}`} · {t.to ? `Step ${doneSteps(t)}, no limit in a chat` : `Step ${doneSteps(t)} of 200`}
              </p>
              <ol className="pilot-plan">{t.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
              <div className="pilot-steps" role="table" aria-label="What it did">
                <div role="row" className="pilot-step head"><span role="columnheader">Time</span><span role="columnheader">Step</span><span role="columnheader">Result</span></div>
                {!t.log.length && <div className="muted pilot-none">Nothing yet</div>}
                {t.log.map((s, i) => (
                  <div role="row" key={t.log.length - i} className="pilot-step">
                    <span className="mono muted">{hhmm(s.at)}</span><span>{sentence(s.text)}</span>
                    <span className={`pilot-result ${RESULT[s.verdict][1]}`}>{RESULT[s.verdict][0]}</span>
                  </div>
                ))}
              </div>
              {(t.summary || t.why) && <p className="muted pilot-sub">{sentence((t.summary ?? t.why)!)}</p>}
            </>
          ) : (
            <EmptyState title="No task right now" note={<>In Claude Code, ask for something like “reply to Mom on WhatsApp: on my way”.
              You see the plan first, and nothing happens until you press Allow. Tether must be open and unlocked, the phone on USB.</>} />
          )}
        </section>

        <aside className="inspector pilot-side" aria-label="Rules and history">
          <h2 className="section-title">Rules</h2>
          <div className="switch-row">Ask before every send<Switch label="Ask before every send" on={askSends} set={(on) => run(tether.pilotAskSends(on))} /></div>
          {!askSends && (
            <p className="pilot-warn" role="status">
              Sends to the planned person or app go without asking. Anyone else is still blocked. Stays off until you turn it on.
            </p>
          )}
          <p className="soft pilot-rules">
            Nothing happens until you allow a plan. Only planned apps open. Sends and reactions show who and what first; a wrong chat
            stops the task. Deletes, installs, settings and system panels ask you. Lock screens wait for you. Money apps and payment
            buttons are always blocked.
          </p>
          <div className="pilot-stopkey">Stop the AI any time <Kbd keys={['Ctrl', 'Alt', 'X']} /></div>

          <h2 className="section-title pilot-gap">Earlier today</h2>
          {!past.length && <span className="muted">Nothing yet</span>}
          {past.map((p, i) => (
            <div key={`${p.startedAt}-${i}`} className="pilot-past" title={(p.summary ?? p.why) ? sentence((p.summary ?? p.why)!) : undefined}>
              <span className="ellipsis">{p.goal}</span>
              <span className={p.status === 'done' ? 'muted' : 'bad'}>{STATUS[p.status]}</span>
            </div>
          ))}

          <h2 className="section-title pilot-gap">Claude Code</h2>
          <p className="soft pilot-rules">
            {connected ? 'Connected. Ask Claude Code to use your phone: every task waits for your Allow.'
              : 'Connect once so Claude Code gets the phone tools. Only changes a settings file on this PC.'}
          </p>
          {connected !== null && (
            <button className={`btn mid${connected ? '' : ' primary'}`} onClick={() => run(connected ? tether.pilotDisconnect() : tether.pilotConnect())}>
              {connected ? 'Disconnect Claude Code' : 'Connect Claude Code'}
            </button>
          )}
          {connected === null && command && (
            <div>
              <div className="muted small-print">Claude Code not found. Run this in a terminal:</div>
              <code className="mono pilot-cmd">{command}</code>
            </div>
          )}
          {error && <span className="error-text" role="alert">{error}</span>}
        </aside>
      </div>
    </div>
  )
}
