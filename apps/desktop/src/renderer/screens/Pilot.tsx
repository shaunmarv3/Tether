import { useEffect, useState } from 'react'
import type { AppState, PilotQuestion, PilotTaskView } from '../../shared/api'
import { tether } from '../tether'
import { ago, Switch, useNow } from './Clipboard'
import { errText } from './Files'

const QUESTION_S = 120 // main answers NO after this
const STATUS: Record<PilotTaskView['status'], string> = {
  waiting: 'WAITING FOR YOUR OK', running: 'RUNNING', denied: 'YOU SAID NO', stopped: 'STOPPED', done: 'DONE',
}
const LED: Record<string, string> = { ok: 'on', asked: 'amber', blocked: 'red' }
const doneSteps = (t: PilotTaskView) => t.log.filter((s) => s.verdict !== 'blocked').length

// The plan/send/risky/unlock/question popup, over every page. The "no" key has focus so a stray Enter never says yes.
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
  const title = q.kind === 'plan' ? 'AI WANTS TO START A TASK' : q.kind === 'question' ? 'AI ASKS YOU' : q.kind === 'unlock' ? `${q.app.toUpperCase()} IS LOCKED`
    : react ? 'AI WANTS TO REACT' : q.kind === 'send' ? 'AI WANTS TO SEND'
    : q.why === 'SETTINGS' ? 'AI WANTS TO CHANGE SETTINGS' : q.why === 'SYSTEM DIALOG' ? 'AI WANTS TO ANSWER A SYSTEM POPUP'
    : q.why === 'SYSTEM PANEL' ? 'AI WANTS TO TAP IN SYSTEM PANELS'
    : q.why.includes('WITHOUT SCREEN TEXT') ? `AI WANTS TO ${q.why}` : `AI WANTS TO TAP ${q.why}`
  const [no, yes] = q.kind === 'plan' ? ['DENY', 'ALLOW'] : q.kind === 'unlock' ? ['STOP', 'DONE'] : q.kind === 'question' ? ['SKIP', 'ANSWER']
    : react ? ["DON'T REACT", 'REACT'] : q.kind === 'send' ? ["DON'T SEND", 'SEND'] : ['NO', 'YES']

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
            {react ? <><dt>REACTION</dt><dd className="pilot-emoji">{q.message}</dd></> : (
              <>
                <dt>MESSAGE</dt>
                <dd className="col tight">
                  <textarea className="pilot-msg pilot-edit" value={text} maxLength={1000} rows={3} aria-label="Message to send"
                    onChange={(e) => setText(e.target.value)} />
                  <span className="mono tiny muted">EDIT IT IF YOU LIKE · THIS IS EXACTLY WHAT GETS SENT</span>
                </dd>
              </>
            )}
            <dt>APP</dt><dd>{q.app}</dd>
          </dl>
        )}
        {q.kind === 'risky' && <dl className="specs"><dt>APP</dt><dd>{q.app}</dd></dl>}
        {q.kind === 'question' && (
          <div className="col">
            <p className="pilot-msg">{q.message}</p>
            <textarea className="pilot-msg pilot-edit" value={text} maxLength={1000} rows={3} aria-label="Your answer for Claude"
              placeholder="Your answer…" onChange={(e) => setText(e.target.value)} />
            <span className="mono tiny muted">CLAUDE USES ONLY WHAT YOU TYPE HERE · SKIP = IT WON'T GUESS</span>
          </div>
        )}
        {q.kind === 'unlock' && <p className="card-note">Unlock it on your phone, then press DONE. The AI waits and never types your PIN or password.</p>}
        <div className="row">
          <button className="key wide grow-key" autoFocus onClick={() => answer(false)}>{no}</button>
          <button className="key wide grow-key accent" disabled={typed && !text.trim()} onClick={() => answer(true)}>{yes}</button>
        </div>
      </div>
    </div>
  )
}

export function Pilot({ state }: { state: AppState }) {
  const now = useNow()
  const [error, setError] = useState<string | null>(null)
  const { connected, command, current: t, past, askSends } = state.pilot
  const live = !!t && (t.status === 'waiting' || t.status === 'running')
  const run = (p: Promise<void>) => { setError(null); p.catch((err) => setError(errText(err))) }
  const claude = connected === true ? 'CONNECTED' : connected === false ? 'NOT CONNECTED' : 'CONNECT BY HAND'

  return (
    <main className="main">
      <header className="col">
        <span className="mono small muted">AI PILOT · CLAUDE CODE {claude}</span>
        <h1 className="headline">Claude drives, <span className="accent-text">you decide.</span></h1>
      </header>

      <div className="cards">
        <section className="lcd sec-status" aria-label="AI pilot status">
          <span className="sec-big">{live && <span className="blink">● </span>}{t ? STATUS[t.status] : '● NO TASK'}</span>
          <div className="sec-grid">
            <div className="col tight"><span className="dim tiny">CLAUDE CODE</span><span>{claude}</span></div>
            <div className="col tight"><span className="dim tiny">STEPS</span><span>{t ? `${doneSteps(t)}${t.to ? ' · CHAT, NO LIMIT' : ' / 200'}` : '—'}</span></div>
            <div className="col tight"><span className="dim tiny">APPS ALLOWED</span><span>{t ? t.apps.join(', ').toUpperCase() : 'NONE'}</span></div>
            <div className="col tight"><span className="dim tiny">STOP KEY</span><span>CTRL+ALT+X</span></div>
          </div>
        </section>

        {live ? (
          <section className="card lockdown-card" aria-labelledby="stop-h">
            <div className="col">
              <h2 id="stop-h" className="card-title">Stop the AI</h2>
              <p className="card-note">Ends the task at once. Claude has to ask again before it can touch the phone.</p>
            </div>
            <button className="key danger" onClick={() => run(tether.pilotStop())}>STOP NOW</button>
          </section>
        ) : (
          <section className="card lockdown-card" aria-labelledby="cc-h">
            <div className="col">
              <h2 id="cc-h" className="card-title">Claude Code</h2>
              <p className="card-note">
                {connected ? 'Connected. Ask Claude Code to use your phone: every task waits for your ALLOW.'
                  : 'Connect once so Claude Code gets the phone tools. Only changes a settings file on this PC.'}
              </p>
            </div>
            {connected !== null && (
              <button className={`key ${connected ? '' : 'accent'} pilot-connect`} onClick={() => run(connected ? tether.pilotDisconnect() : tether.pilotConnect())}>
                {connected ? 'DISCONNECT' : 'CONNECT CLAUDE CODE'}
              </button>
            )}
            {connected === null && command && (
              <div className="col">
                <span className="mono tiny muted">CLAUDE CODE NOT FOUND · RUN THIS IN A TERMINAL</span>
                <code className="pilot-cmd mono">{command}</code>
              </div>
            )}
            {error && <span className="mono small danger-text" role="alert">{error}</span>}
          </section>
        )}
      </div>

      <div className="cards top">
        <section className="card" aria-labelledby="task-h">
          <h2 id="task-h" className="card-head">TASK</h2>
          {t ? (
            <>
              <span className="card-title pilot-goal">{t.goal}</span>
              {t.to && <span className="mono tiny muted">MESSAGES ONLY TO · {t.to.toUpperCase()}</span>}
              <ol className="pilot-plan muted">{t.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
              <h3 className="card-head pilot-did">WHAT IT DID</h3>
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
            </>
          ) : (
            <>
              <p className="card-note">
                No task right now. In Claude Code, ask for something like “reply to Mom on WhatsApp: on my way”.
                You will see the plan here first, and nothing happens until you press ALLOW.
              </p>
              <span className="mono tiny muted">TETHER MUST BE OPEN AND UNLOCKED · PHONE ON USB</span>
            </>
          )}
        </section>

        <div className="col stack">
          <section className="card" aria-labelledby="rules-h">
            <h2 id="rules-h" className="card-head">THE RULES</h2>
            <div className="col toggles">
              <Switch label="Ask me before every send" on={askSends} set={(on) => run(tether.pilotAskSends(on))} />
            </div>
            {!askSends && (
              <span className="mono tiny amber-text" role="status">
                SENDS TO THE PLANNED PERSON GO WITHOUT ASKING · ANYONE ELSE IS STILL BLOCKED · BACK ON WHEN TETHER LOCKS
              </span>
            )}
            <ul className="pilot-rules card-note">
              <li>Nothing happens until you ALLOW a plan.</li>
              <li>Only the apps in the plan can be opened.</li>
              <li>Sends and reactions show who and what first. A wrong chat stops the task.</li>
              <li>Deletes, installs, settings and system panels ask you too.</li>
              <li>Lock screens wait for you to unlock them.</li>
              <li>Money apps and payment buttons are always blocked.</li>
            </ul>
          </section>
          <section className="lcd activity" aria-label="Past tasks">
            <span className="dim tiny">PAST TASKS · THIS SESSION</span>
            {!past.length && <span>NOTHING YET</span>}
            {past.map((p, i) => (
              <span key={`${p.startedAt}-${i}`}>{STATUS[p.status]} › {p.goal.toUpperCase()}{(p.summary || p.why) && <span className="dim"> · {(p.summary ?? p.why)!.toUpperCase()}</span>}</span>
            ))}
          </section>
        </div>
      </div>
    </main>
  )
}
