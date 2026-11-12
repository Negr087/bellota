import { useEffect, useRef, useState } from 'react'
import { errMsg, fmtSats, shortUrl } from './kit.jsx'
import { forgetGift } from '../lib/gift.js'

// Full-screen "you got a gift" moment for someone opening a gift link.
// Phases: checking → ready → opening (lid flies off) → overlay fades → claim → acorns pour into the jar.
export default function GiftOverlay({ w, token, onDone, onLater, onIntro }) {
  const [phase, setPhase] = useState('checking') // checking | ready | spent | error | opening
  const [info, setInfo] = useState(null)
  const [err, setErr] = useState('')
  const [leaving, setLeaving] = useState(false)
  const primary = useRef(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      let i
      try {
        i = w.actions.tokenInfo(token)
      } catch {
        if (alive) {
          setErr("This gift link is broken or incomplete. Ask the sender for a new one.")
          setPhase('error')
        }
        return
      }
      if (!alive) return
      setInfo(i)
      try {
        const spent = await w.actions.isTokenSpent(token)
        if (!alive) return
        if (spent) {
          forgetGift()
          setPhase('spent')
          return
        }
      } catch {
        /* can't reach the mint right now: let them try to open it anyway */
      }
      if (alive) setPhase('ready')
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  useEffect(() => {
    primary.current?.focus()
  }, [phase])

  const open = () => {
    setPhase('opening')
    // let the lid fly off, then get out of the way so the acorns can be seen pouring into the jar
    setTimeout(async () => {
      setLeaving(true)
      try {
        const amount = await w.actions.receiveToken(token)
        forgetGift()
        onDone(amount)
      } catch (e) {
        const m = errMsg(e)
        setLeaving(false)
        if (/spent|already/i.test(m)) {
          forgetGift()
          setPhase('spent')
        } else {
          setErr(m)
          setPhase('error')
        }
      }
    }, 900)
  }

  const known = info && w.state.mints.some((m) => m.url === info.mint.replace(/\/+$/, ''))
  const opening = phase === 'opening'

  return (
    <div className={`gift${leaving ? ' leaving' : ''}`} role="dialog" aria-modal="true" aria-labelledby="gift-title">
      <div className={`gift-card${opening ? ' opening' : ''}`}>
        <div className={`gift-box${phase === 'spent' ? ' empty' : ''}`} aria-hidden="true">
          <div className="gift-lid">
            <span className="bow l" />
            <span className="bow r" />
          </div>
          <div className="gift-body" />
          {opening &&
            [0, 1, 2, 3, 4].map((i) => (
              <svg key={i} className={`gift-acorn g${i}`}>
                <use href="#acorn" />
              </svg>
            ))}
        </div>

        {phase === 'checking' && <p className="gift-sub">Unwrapping…</p>}

        {(phase === 'ready' || opening) && info && (
          <>
            <h2 id="gift-title">You got a gift! 🎁</h2>
            <p className="gift-amount">{fmtSats(info.amount)} sats</p>
            {info.memo && <p className="gift-memo">“{info.memo}”</p>}
            <p className="gift-sub">
              Cashu ecash from <b>{shortUrl(info.mint)}</b>
            </p>
            {!known && !w.backend.isDemo && (
              <p className="gift-note">Opening it adds this mint to your wallet. Only accept gifts from people and mints you trust.</p>
            )}
            <button ref={primary} className="btn primary xl" disabled={opening} onClick={open}>
              {opening ? 'Opening…' : 'Open it 🎁'}
            </button>
            {!opening && (
              <button className="btn ghost" onClick={onLater}>
                Not now
              </button>
            )}
          </>
        )}

        {phase === 'spent' && (
          <>
            <h2 id="gift-title">This gift was already opened</h2>
            <p className="gift-sub">Someone claimed these sats before. Gift links work once, like cash.</p>
            <button ref={primary} className="btn primary xl" onClick={onLater}>
              OK
            </button>
          </>
        )}

        {phase === 'error' && (
          <>
            <h2 id="gift-title">Couldn't open the gift</h2>
            <p className="error">{err}</p>
            {info && (
              <button ref={primary} className="btn primary xl" onClick={open}>
                Try again
              </button>
            )}
            <button className="btn ghost" onClick={onLater}>
              Close
            </button>
          </>
        )}

        {!opening && (
          <button className="gift-help" onClick={onIntro}>
            New to Bellota? See how it works
          </button>
        )}
      </div>
    </div>
  )
}
