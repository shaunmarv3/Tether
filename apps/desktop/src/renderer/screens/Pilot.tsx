import { useEffect, useState } from 'react'
import type { AppState, PilotQuestion, PilotTaskView } from '../../shared/api'
import { tether } from '../tether'
import { ago, useNow } from './Clipboard'
import { errText } from './Files'

const QUESTION_S = 120 // main answers NO after this
const STATUS: Record<PilotTaskView['status'], string> = {
  waiting: 'WAITING FOR YOUR OK', running: 'RUNNING', denied: 'YOU SAID NO', stopped: 'STOPPED', done: 'DONE',
}
const LED: Record<string, string> = { ok: 'on', asked: 'amber', blocked: 'red' }
const doneSteps = (t: PilotTaskView) => t.log.filter((s) => s.verdict !== 'blocked').length

// The plan/send/risky question, over every page. DENY has focus so a stray Enter never says yes.
export function PilotAsk({ q }: { q: PilotQuestion }) {
  const now = useNow()
  const [since, setSince] = useState(Date.now())
  useEffect(() => setSince(Date.now()), [q.id])
  const left = Math.max(0, QUESTION_S - Math.floor((now - since) / 1000))
  const answer = (yes: boolean) => void tether.pilotAnswer(q.id, yes)
  const title = q.kind === 'plan' ? 'AI WANTS TO START A TASK' : q.kind === 'send' ? 'AI WANTS TO SEND'
    : q.why === 'SETTINGS' ? 'AI WANTS TO CHANGE SETTINGS' : q.why === 'SYSTEM DIALOG' ? 'AI WANTS TO ANSWER A SYSTEM POPUP'
    : q.why.includes('WITHOUT SCREEN TEXT') ? `AI WANTS TO ${q.why}` : `AI WANTS TO TAP ${q.why}`
  const [no, yes] = q.kind === 'plan' ? ['DENY', 'ALLOW'] : q.kind === 'send' ? ["DON'T SEND", 'SEND'] : ['NO', 'YES']

  return (
    <div className="pilot-ask-back" onKeyDown={(e) => { if (e.key === 'Escape') answer(false) }}>
      <div className="plate pilot-ask" role="alertdialog" aria-modal="true" aria-labelledby="pilot-ask-title">
        <div className="plate-head">
          <span className="tag"><span className="led amber blink" />AI PILOT</span>
          <span className="mono tiny muted">NO IN {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span>
        </div>
        <h2 id="pilot-ask-title" className="card-head">{title}</h2>
        {q.task && (
          <dl className="specs">
            <dt>TASK</dt><dd>{q.task.goal}</dd>
            <dt>PLAN</dt><dd><ol className="pilot-plan">{q.task.steps.map((s, i) => <li key={i}>{s}</li>)}</ol></dd>
            <dt>APPS</dt><dd>{q.task.apps.join(', ')}</dd>
            {q.task.to && <><dt>TO</dt><dd>{q.task.to}</dd></>}
          </dl>
        )}
        {q.kind === 'send' && (
          <dl className="specs">
            <dt>TO</dt><dd>{q.to ?? <span className="danger-text">CAN'T READ IT</span>}<span className="mono tiny muted pilot-from"> · FROM THE PHONE SCREEN</span></dd>
            <dt>MESSAGE</dt><dd className="pilot-msg">{q.message || <span className="muted">(NO TEXT)</span>}</dd>
            <dt>APP</dt><dd>{q.app}</dd>
          </dl>
        )}
        {q.kind === 'risky' && <dl className="specs"><dt>APP</dt><dd>{q.app}</dd></dl>}
        <div className="row">
          <button className="key wide grow-key" autoFocus onClick={() => answer(false)}>{no}</button>
          <button className="key wide grow-key accent" onClick={() => answer(true)}>{yes}</button>
        </div>
      </div>
    </div>
  )
}

function TaskRow({ t, now }: { t: PilotTaskView; now: number }) {
  return (
    <div className="clip-row pilot-past">
      <div className="clip-body">
        <span className="row notif-meta">
          <span className="dir-chip mono">{STATUS[t.status]}</span>
          <span className="mono tiny muted">{ago(t.startedAt, now)} · {t.apps.join(', ').toUpperCase()}</span>
        </span>
        <span className="notif-title">{t.goal}</span>
        {(t.summary || t.why) && <span className="clip-text muted">{t.summary ?? t.why}</span>}
      </div>
    </div>
  )
}

export function Pilot({ state }: { state: AppState }) {
  const now = useNow()
  const [error, setError] = useState<string | null>(null)
  const { connected, command, current: t, past } = state.pilot
  const live = t && (t.status === 'waiting' || t.status === 'running')
  const run = (p: Promise<void>) => { setError(null); p.catch((err) => setError(errText(err))) }
  const line = connected === true ? 'CLAUDE CODE CONNECTED' : connected === false ? 'CLAUDE CODE NOT CONNECTED' : 'CLAUDE CODE: CONNECT BY HAND'

  return (
    <main className="main">
      <header className="col">
        <span className="mono small muted">{line} · {t ? STATUS[t.status] : 'NO TASK'}</span>
        <h1 className="headline">Claude drives, <span className="accent-text">you decide.</span></h1>
      </header>

      <div className="clip-layout">
        <section className="clip-history" aria-labelledby="pilot-h">
          <h2 id="pilot-h" className="clip-head">TASK · NOW</h2>
          {t ? (
            <div className="pilot-task">
              <div className="row between wrap top">
                <div className="col pilot-goal">
                  <span className="mono tiny muted">{t.apps.join(', ').toUpperCase()}{t.to && ` · TO ${t.to.toUpperCase()}`}</span>
                  <span className="card-title">{t.goal}</span>
                </div>
                {live && <button className="key danger pilot-stop" onClick={() => run(tether.pilotStop())}>STOP · CTRL+ALT+X</button>}
              </div>
              <div className="lcd pilot-lcd">
                <div className="screen-row">
                  <span className="small">{live && <span className="blink">● </span>}{STATUS[t.status]}</span>
                  <span className="small dim">STEP {doneSteps(t)} / 40</span>
                </div>
              </div>
              <ol className="pilot-plan muted">{t.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
              <h3 className="card-head">WHAT IT DID</h3>
              {!t.log.length && <span className="mono small muted">NOTHING YET</span>}
              <ul className="pilot-log">
                {t.log.map((s, i) => (
                  <li key={t.log.length - i} className="row">
                    <span className={`led ${LED[s.verdict]}`} />
                    <span className="grow pilot-step">{s.text}</span>
                    <span className="mono tiny muted">{ago(s.at, now)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="files-empty mono small muted">NO TASK · ASK CLAUDE CODE TO USE YOUR PHONE</div>
          )}
          {past.length > 0 && <h2 className="clip-head pilot-past-head">PAST TASKS · THIS SESSION</h2>}
          {past.map((p, i) => <TaskRow key={`${p.startedAt}-${i}`} t={p} now={now} />)}
        </section>

        <aside className="clip-side">
          <section className="card">
            <span className="row"><span className={`led ${connected ? 'on' : ''}`} /><h2 className="card-head">CLAUDE CODE</h2></span>
            <p className="card-note">
              {connected ? 'Claude Code can ask to use your phone. Every task waits for your ALLOW.'
                : 'Connect once so Claude Code gets the phone tools. Nothing goes online from this step.'}
            </p>
            {connected !== null && (
              <button className={`key ${connected ? '' : 'accent'}`} onClick={() => run(connected ? tether.pilotDisconnect() : tether.pilotConnect())}>
                {connected ? 'DISCONNECT' : 'CONNECT CLAUDE CODE'}
              </button>
            )}
            {!connected && command && (
              <>
                <span className="mono tiny muted">OR RUN THIS IN A TERMINAL</span>
                <code className="pilot-cmd mono">{command}</code>
              </>
            )}
            {error && <span className="mono small danger-text" role="alert">{error}</span>}
          </section>
          <section className="card">
            <h2 className="card-head">THE RULES</h2>
            <ul className="pilot-rules card-note">
              <li>Nothing happens until you ALLOW a plan.</li>
              <li>Only the apps in the plan can be opened.</li>
              <li>Sends show who and what first. A wrong chat stops the task.</li>
              <li>Deletes, installs and settings ask you too.</li>
              <li>Money apps are always blocked.</li>
              <li>STOP any time: here, on Mirror, or Ctrl+Alt+X.</li>
            </ul>
          </section>
        </aside>
      </div>
    </main>
  )
}
