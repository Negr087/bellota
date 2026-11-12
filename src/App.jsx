import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useWallet, FORCE_DEMO } from './lib/useWallet.js'
import { makeGiftToken } from './lib/demo.js'
import { fmtSats, shortUrl, errMsg, ScanOverlay } from './ui/kit.jsx'
import { classify } from './lib/parse.js'
import ReceiveSheet from './ui/ReceiveSheet.jsx'
import SendSheet from './ui/SendSheet.jsx'
import MintsSheet from './ui/MintsSheet.jsx'
import HistorySheet from './ui/HistorySheet.jsx'
import SeedSheet from './ui/SeedSheet.jsx'
import Onboarding, { onboardingDone } from './ui/Onboarding.jsx'
import SettingsSheet from './ui/SettingsSheet.jsx'
import { useLook } from './lib/look.js'
import { cue } from './lib/feedback.js'
import { takeGiftFromUrl, isDemoToken } from './lib/gift.js'
import GiftOverlay from './ui/GiftOverlay.jsx'

const Scene = lazy(() => import('./three/Scene.jsx'))

// Read before anything cleans the URL: a gift that arrived in the link opens right away;
// one remembered from an earlier "Not now" waits behind a pill instead.
const GIFT_IN_URL = typeof location !== 'undefined' && /[#&]gift=/.test(location.hash)

// If 3D fails (WebGL off, old GPU), the wallet keeps working
class SceneGuard extends Component {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch() {
    this.props.onFail?.()
  }
  render() {
    return this.state.failed ? <div className="scene-loading">🫙 (your browser can't show 3D, but the wallet still works)</div> : this.props.children
  }
}

// Same markup as the static loader in index.html, so the hand-off from HTML to React is seamless.
const LOADER_TEXT = { boot: 'Opening Bellota', code: 'Fetching the jar', physics: 'Warming up the physics' }
function JarLoader({ stage }) {
  const done = stage === 'ready' || stage === 'failed'
  return (
    <div className={`jar-loader${done ? ' done' : ''}`} role="status" aria-hidden={done}>
      <div className="jl-jar" aria-hidden="true">
        {['a1', 'a2', 'a3'].map((c) => (
          <svg key={c} className={`jl-acorn ${c}`}>
            <use href="#acorn" />
          </svg>
        ))}
        <div className="jl-glass" />
      </div>
      <p className="jl-text">{LOADER_TEXT[stage] || ''}</p>
    </div>
  )
}

function useCountUp(target) {
  const [v, setV] = useState(target)
  const from = useRef(target)
  useEffect(() => {
    const start = performance.now()
    const a = from.current
    let raf
    const step = (t) => {
      const k = Math.min(1, (t - start) / 700)
      const e = 1 - Math.pow(1 - k, 3)
      const val = Math.round(a + (target - a) * e)
      setV(val)
      from.current = val
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target])
  return v
}

export function AcornLogo({ size = 34 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M15 27h34c0 15-8 27-17 27S15 42 15 27z" fill="#F5A524" stroke="#2B1D14" strokeWidth="4" strokeLinejoin="round" />
      <ellipse cx="24" cy="36" rx="3" ry="7" fill="#fff" opacity=".6" transform="rotate(15 24 36)" />
      <path d="M10 28c0-11 10-17 22-17s22 6 22 17c-8 3-36 3-44 0z" fill="#8B5A2B" stroke="#2B1D14" strokeWidth="4" strokeLinejoin="round" />
      <path d="M32 11c0-4 2-7 6-8" stroke="#2B1D14" strokeWidth="4" strokeLinecap="round" fill="none" />
    </svg>
  )
}

export default function App() {
  const w = useWallet()
  const [sheet, setSheet] = useState(null)
  const look = useLook()
  // Sound + vibration for each wallet event (receive / send / pay / shake)
  useEffect(() => {
    if (w.fx.n > 0) cue(w.fx.kind)
  }, [w.fx])
  // The "tap an acorn / shake" hint disappears for good once you've shaken the jar.
  const [poked, setPoked] = useState(() => {
    try {
      return localStorage.getItem('bellota:poked') === '1'
    } catch {
      return false
    }
  })
  const shake = useCallback(() => {
    w.actions.shake()
    if (!poked) {
      setPoked(true)
      try {
        localStorage.setItem('bellota:poked', '1')
      } catch {
        /* no storage */
      }
    }
  }, [w.actions, poked])
  // 🎁 Gift link (#gift=<token>): read once on load, and again if a new link opens in this tab
  const [gift, setGift] = useState(() => takeGiftFromUrl())
  const [giftOpen, setGiftOpen] = useState(() => !!gift && GIFT_IN_URL)
  useEffect(() => {
    const onHash = () => {
      if (!/gift=/.test(location.hash)) return
      const g = takeGiftFromUrl()
      if (g) {
        setGift(g)
        setGiftOpen(true)
      }
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  // Demo gifts open in demo mode, real ones in real mode
  const giftMode = gift ? (isDemoToken(gift) ? 'demo' : 'real') : null
  useEffect(() => {
    if (giftMode && giftOpen && !FORCE_DEMO && w.mode !== giftMode) w.setMode(giftMode)
  }, [giftMode, giftOpen, w])

  // First visit: a short intro. Not for people arriving via a ?scan= or gift link, nor for wallets already in use.
  const [intro, setIntro] = useState(
    () => !onboardingDone() && !gift && !new URLSearchParams(location.search).has('scan') && w.total === 0 && w.state.history.length === 0,
  )
  const [stage, setStage] = useState('code') // code → physics → ready (or failed)
  // Never leave the loader up forever: if the GPU is very slow, show the app anyway.
  useEffect(() => {
    const t = setTimeout(() => setStage((s) => (s === 'ready' || s === 'failed' ? s : 'ready')), 20000)
    return () => clearTimeout(t)
  }, [])
  const [scanning, setScanning] = useState(false)
  const [scanned, setScanned] = useState(null) // the last thing the dock scanner read
  const [toasts, setToasts] = useState([])
  const shown = useCountUp(w.balance)
  const activeMint = w.state.mints.find((m) => m.url === w.state.active)

  const toast = useCallback((text, kind = 'ok') => {
    const id = Math.random()
    setToasts((t) => [...t, { id, text, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200)
  }, [])

  // Deep links: ?scan=<token|invoice|address> (also what the web+cashu: protocol handler opens)
  useEffect(() => {
    const q = new URLSearchParams(location.search)
    const raw = q.get('scan')
    if (!raw) return
    // Drop scan= from the URL by hand (URLSearchParams would turn a bare ?demo into ?demo=)
    const rest = location.search.slice(1).split('&').filter((kv) => kv && !kv.startsWith('scan=')).join('&')
    history.replaceState(null, '', location.pathname + (rest ? `?${rest}` : '') + location.hash)
    const r = classify(raw)
    if (r.kind === 'token') {
      setScanned(r)
      setSheet('receive')
    } else if (r.kind === 'invoice' || r.kind === 'address') {
      setScanned(r)
      setSheet('send')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const close = useCallback(() => {
    setSheet(null)
    setScanned(null)
  }, [])
  const empty = w.activeProofs.length === 0
  const mintCount = Object.values(w.state.proofs).filter((p) => p.length).length

  return (
    <div className="app">
      <div className="bg" aria-hidden="true" />

      <div className="scene">
        <SceneGuard onFail={() => setStage('failed')}>
          <Suspense fallback={null}>
            <Scene
              proofs={w.activeProofs}
              fx={w.fx}
              amountOf={w.amountOf}
              onPoke={shake}
              onStage={setStage}
              theme={look.theme}
              jar={look.jar}
            />
          </Suspense>
        </SceneGuard>
      </div>
      <JarLoader stage={stage} />

      <header className="top">
        <div className="brand">
          <AcornLogo />
          <span className="brand-name">Bellota</span>
          {w.mode === 'demo' && <span className="tag">demo</span>}
        </div>
        <div className="top-actions">
          <button className="mint-chip" onClick={() => setSheet('mints')} title="Switch mint">
            🏦 <span>{activeMint?.name || shortUrl(w.state.active || 'no mint')}</span> ▾
          </button>
          <button className="icon-btn" onClick={() => setSheet('history')} aria-label="History">
            📜
          </button>
          <button className="icon-btn" onClick={() => setSheet('settings')} aria-label="Settings">
            ⚙️
          </button>
        </div>
      </header>

      <section className="balance">
        <span className="label">In this jar</span>
        <div className="bal">
          {fmtSats(shown)} <span>sats</span>
        </div>
        <span className="meta">
          🌰 {w.activeProofs.length} {w.activeProofs.length === 1 ? 'acorn' : 'acorns'}
          {mintCount > 1 && ` · ${fmtSats(w.total)} sats total in ${mintCount} mints`}
        </span>
        {w.inTransit > 0 && <span className="meta transit">⏳ {fmtSats(w.inTransit)} sats in transit (Lightning payment not confirmed yet)</span>}
      </section>

      {empty && (
        <div className="bubble">
          <b>Your jar is empty!</b>
          <span>
            Each acorn is a Cashu ecash proof: digital bearer money, as private as cash.
          </span>
          {w.backend.isDemo ? (
            <button
              className="btn primary"
              onClick={async () => {
                try {
                  await w.actions.receiveToken(makeGiftToken(1337))
                  toast('+1,337 toy sats 🌰')
                } catch (e) {
                  toast(errMsg(e), 'err')
                }
              }}
            >
              Fill it with toy sats 🎁
            </button>
          ) : (
            <button className="btn primary" onClick={() => setSheet('receive')}>
              Receive my first sats
            </button>
          )}
        </div>
      )}

      {gift && !giftOpen && (
        <button className="seed-nag gift-pill" onClick={() => setGiftOpen(true)}>
          🎁 <span>You have an unopened gift</span> →
        </button>
      )}

      {!(gift && !giftOpen) && !empty && w.backend.seed && !w.backend.seed.backedUp() && (
        <button className="seed-nag" onClick={() => setSheet('seed')}>
          🌱 <span>Write down your 12 words so you never lose your sats</span> →
        </button>
      )}

      {!empty && !poked && <p className="poke-hint">Tap an acorn to see its value · tap the jar to shake it</p>}

      <nav className="dock">
        <button className="dock-btn in" onClick={() => setSheet('receive')}>
          <span className="dock-ico">↓</span> Receive
        </button>
        <button className="dock-btn shake" onClick={shake} aria-label="Shake the jar" title="Shake">
          🫨
        </button>
        <button className="dock-btn shake scan" onClick={() => setScanning(true)} aria-label="Scan QR" title="Scan">
          📷
        </button>
        <button className="dock-btn out" onClick={() => setSheet('send')} disabled={empty}>
          Send <span className="dock-ico">↑</span>
        </button>
      </nav>

      {sheet === 'receive' && <ReceiveSheet w={w} onClose={close} toast={toast} initialToken={scanned?.kind === 'token' ? scanned.value : undefined} />}
      {sheet === 'send' && <SendSheet w={w} onClose={close} toast={toast} initialInvoice={scanned?.kind === 'invoice' || scanned?.kind === 'address' ? scanned.value : undefined} />}
      <ScanOverlay
        open={scanning}
        onClose={() => setScanning(false)}
        onResult={(raw) => {
          setScanning(false)
          const r = classify(raw)
          if (r.kind === 'token') {
            setScanned(r)
            setSheet('receive')
          } else if (r.kind === 'invoice' || r.kind === 'address') {
            setScanned(r)
            setSheet('send')
          } else toast("That QR isn't a Cashu token, an invoice or a Lightning Address", 'err')
        }}
      />
      {sheet === 'mints' && (
        <MintsSheet
          w={w}
          onClose={close}
          toast={toast}
          onSeed={() => setSheet('seed')}
        />
      )}
      {gift && giftOpen && (FORCE_DEMO || w.mode === giftMode) && (
        <GiftOverlay
          key={gift + w.mode}
          w={w}
          token={gift}
          onDone={(amount) => {
            setGift(null)
            setGiftOpen(false)
            toast(`🎁 +${fmtSats(amount)} sats. Enjoy!`)
          }}
          onLater={() => {
            setGiftOpen(false)
            setGift(takeGiftFromUrl()) // null if it turned out to be already spent
          }}
          onIntro={() => {
            setGiftOpen(false)
            setIntro(true)
          }}
        />
      )}
      {intro && <Onboarding w={w} forceDemo={FORCE_DEMO} onClose={() => setIntro(false)} />}
      {sheet === 'seed' && <SeedSheet w={w} onClose={close} toast={toast} />}
      {sheet === 'settings' && (
        <SettingsSheet
          w={w}
          look={look}
          onClose={close}
          onIntro={() => {
            close()
            setIntro(true)
          }}
        />
      )}
      {sheet === 'history' && <HistorySheet w={w} onClose={close} toast={toast} />}

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  )
}
