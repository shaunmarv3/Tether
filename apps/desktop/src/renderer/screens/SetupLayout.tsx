import type { ReactNode } from 'react'
import { Logo } from '../Logo'
import { BareTitleBar } from '../Shell'

const STEPS: [string, string][] = [
  ['Set a password', 'You type it each time Tether opens'],
  ['Download the engine', 'scrcpy + adb, 11.3 MB'],
  ['Connect your phone', 'One USB cable'],
]

// First run (AP-Setup): logo, wordmark and the 3 steps on the left; the current step on the right.
export function SetupLayout({ step, children }: { step: 1 | 2 | 3; children: ReactNode }) {
  return (
    <div className="app">
      <BareTitleBar crumb="Setup" />
      <div className="setup">
        <aside className="setup-side">
          <div className="setup-brand"><Logo size={44} /><span className="setup-word">Tether</span></div>
          <ol className="setup-steps" aria-label="Setup steps">
            {STEPS.map(([name, sub], i) => {
              const n = i + 1
              return (
                <li key={name} className={`setup-step${n === step ? ' on' : n < step ? ' done' : ''}`} aria-current={n === step ? 'step' : undefined}>
                  <span className="setup-mark">{n < step ? '✓' : n}</span>
                  <span><span className="setup-step-name">{name}</span><span className="setup-step-sub">{sub}</span></span>
                </li>
              )
            })}
          </ol>
          <p className="setup-foot">Everything stays on this PC. Tether talks to your phone over the USB cable only.</p>
        </aside>
        <main className="setup-main">
          <span className="mono muted setup-count">Step {step} of 3</span>
          {children}
        </main>
      </div>
    </div>
  )
}
