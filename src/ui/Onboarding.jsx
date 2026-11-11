import { useEffect, useRef, useState } from 'react'
import { TIERS, splitPow2, tierOf } from '../lib/tiers.js'
import { fmtSats } from './kit.jsx'

const KEY = 'bellota:onboarded'
export const onboardingDone = () => {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return true // no storage: don't nag on every visit
  }
}
const markDone = () => {
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    /* no storage */
  }
}

// Acorn tinted by denomination; bigger amount, bigger acorn (like the 3D coins).
export function Acorn({ amount, size }) {
  const t = tierOf(amount)
  const s = size ?? 26 + 3.2 * Math.log2(Math.max(1, amount))
  return (
    <svg width={s} height={s} viewBox="0 0 64 64" aria-hidden="true" className="ob-acorn">
      <path d="M15 27h34c0 15-8 27-17 27S15 42 15 27z" fill={t.face} stroke="#2B1D14" strokeWidth="4" strokeLinejoin="round" />
      <ellipse cx="24" cy="36" rx="3" ry="7" fill="#fff" opacity=".55" transform="rotate(15 24 36)" />
      <path d="M10 28c0-11 10-17 22-17s22 6 22 17c-8 3-36 3-44 0z" fill="#8B5A2B" stroke="#2B1D14" strokeWidth="4" strokeLinejoin="round" />
      <path d="M32 11c0-4 2-7 6-8" stroke="#2B1D14" strokeWidth="4" strokeLinecap="round" fill="none" />
    </svg>
  )
}

function Splitter() {
  const [raw, setRaw] = useState('1337')
  const n = Math.min(Number(raw) || 0, 999999)
  const parts = splitPow2(n)
  return (
    <div className="ob-split">
      <label className="ob-amount">
        <input
          inputMode="numeric"
          pattern="[0-9]*"
          value={raw}
          aria-label="Amount in sats"
          onChange={(e) => setRaw(e.target.value.replace(/\D/g, '').slice(0, 6))}
        />
        <span>sats</span>
      </label>
      <div className="ob-acorns" aria-live="polite">
        {parts.map((a, i) => (
          <span key={`${a}-${i}`} className="ob-coin" style={{ animationDelay: `${i * 60}ms` }}>
            <Acorn amount={a} />
            <small>{fmtSats(a)}</small>
          </span>
        ))}
      </div>
      <p className="ob-eq">
        {n > 0 ? (
          <>
            {fmtSats(n)} = {parts.map(fmtSats).join(' + ')} → <b>{parts.length} {parts.length === 1 ? 'acorn' : 'acorns'}</b>
          </>
        ) : (
          'Type an amount'
        )}
      </p>
    </div>
  )
}

export default function Onboarding({ w, forceDemo, onClose }) {
  const [step, setStep] = useState(0)
  const primary = useRef(null)
  const finish = (mode) => {
    markDone()
    if (mode && !forceDemo) w.setMode(mode)
    onClose()
  }

  useEffect(() => {
    primary.current?.focus()
  }, [step])
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && finish()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const steps = [
    {
      title: 'Your sats are acorns',
      body: (
        <>
          <div className="ob-hero">
            <Acorn amount={1} size={54} />
            <Acorn amount={64} size={70} />
            <Acorn amount={8} size={58} />
          </div>
          <p>
            Bellota is a <b>Cashu</b> wallet. Cashu is <b>ecash for Bitcoin</b>: digital bearer money that's as private as cash. You hold it on your device; a{' '}
            <b>mint</b> holds the sats behind it.
          </p>
          <p>Every piece of ecash you own is an acorn in your jar. Receive and they drop in. Spend and they fly out.</p>
        </>
      ),
    },
    {
      title: 'Size tells the value',
      body: (
        <>
          <p>
            Cashu splits every amount into <b>powers of 2</b>, so each acorn is worth 1, 2, 4, 8… sats. Try it:
          </p>
          <Splitter />
          <ul className="ob-legend">
            {TIERS.map((t) => (
              <li key={t.name}>
                <span className="ob-swatch" style={{ background: t.face }} /> {t.name} <small>{t.range}</small>
              </li>
            ))}
          </ul>
        </>
      ),
    },
    {
      title: 'Pick your jar',
      body: forceDemo ? (
        <p>This build runs a toy mint with pretend sats, so nothing you do here costs anything. Fill the jar, send some acorns, pay an invoice, and have fun.</p>
      ) : (
        <>
          <p>
            <b>Demo</b> uses a toy mint with pretend sats, offline. Good for poking around.
          </p>
          <p>
            <b>Real mints</b> start on <i>testnut</i>, where the sats are fake and invoices pay themselves. Add a mint with real sats any time from 🏦.
          </p>
          <p className="ob-note">🌱 With real mints you get a 12-word seed. Write it down: it's the only way back if you lose this browser.</p>
        </>
      ),
    },
  ]
  const last = step === steps.length - 1

  return (
    <div className="onboard" role="dialog" aria-modal="true" aria-labelledby="ob-title">
      <section className="ob-card" key={step}>
        <header className="ob-head">
          <span className="ob-step">
            {step + 1} / {steps.length}
          </span>
          <button className="ob-skip" onClick={() => finish()}>
            Skip
          </button>
        </header>
        <h2 id="ob-title">{steps[step].title}</h2>
        <div className="ob-body">{steps[step].body}</div>
        <div className="ob-dots" aria-hidden="true">
          {steps.map((_, i) => (
            <span key={i} className={i === step ? 'on' : ''} />
          ))}
        </div>
        <footer className="ob-actions">
          {step > 0 && (
            <button className="btn ghost" onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          {!last ? (
            <button ref={primary} className="btn primary grow" onClick={() => setStep(step + 1)}>
              Next
            </button>
          ) : forceDemo ? (
            <button ref={primary} className="btn primary grow" onClick={() => finish()}>
              Let's go 🌰
            </button>
          ) : (
            <>
              <button className="btn grow" onClick={() => finish('demo')}>
                Try the demo 🧸
              </button>
              <button ref={primary} className="btn primary grow" onClick={() => finish('real')}>
                Real mints ⚡
              </button>
            </>
          )}
        </footer>
      </section>
    </div>
  )
}
