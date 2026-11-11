import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useWallet } from './lib/useWallet.js'
import { makeGiftToken } from './lib/demo.js'
import { fmtSats, shortUrl, errMsg, ScanOverlay } from './ui/kit.jsx'
import { classify } from './lib/parse.js'
import ReceiveSheet from './ui/ReceiveSheet.jsx'
import SendSheet from './ui/SendSheet.jsx'
import MintsSheet from './ui/MintsSheet.jsx'
import HistorySheet from './ui/HistorySheet.jsx'
import SeedSheet from './ui/SeedSheet.jsx'

const Scene = lazy(() => import('./three/Scene.jsx'))

// Si el 3D falla (WebGL apagado, GPU vieja), la wallet sigue funcionando
class SceneGuard extends Component {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? <div className="scene-loading">🫙 (tu navegador no muestra 3D, pero la wallet funciona igual)</div> : this.props.children
  }
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
  const [scanning, setScanning] = useState(false)
  const [scanned, setScanned] = useState(null) // lo último que leyó el escáner del dock
  const [toasts, setToasts] = useState([])
  const shown = useCountUp(w.balance)
  const activeMint = w.state.mints.find((m) => m.url === w.state.active)

  const toast = useCallback((text, kind = 'ok') => {
    const id = Math.random()
    setToasts((t) => [...t, { id, text, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200)
  }, [])

  const close = useCallback(() => {
    setSheet(null)
    setScanned(null)
  }, [])
  const empty = w.activeProofs.length === 0
  const mintCount = Object.values(w.state.proofs).filter((p) => p.length).length

  return (
    <div className="app">
      <div className="bg" aria-hidden="true">
        <div className="sun" />
        <div className="blob b1" />
        <div className="blob b2" />
      </div>

      <div className="scene">
        <SceneGuard>
          <Suspense fallback={<div className="scene-loading">Llenando el frasco…</div>}>
            <Scene proofs={w.activeProofs} fx={w.fx} amountOf={w.amountOf} onPoke={w.actions.shake} />
          </Suspense>
        </SceneGuard>
      </div>

      <header className="top">
        <div className="brand">
          <AcornLogo />
          <span>Bellota</span>
          {w.mode === 'demo' && <span className="tag">demo</span>}
        </div>
        <div className="top-actions">
          <button className="mint-chip" onClick={() => setSheet('mints')} title="Cambiar de mint">
            🏦 <span>{activeMint?.name || shortUrl(w.state.active || 'sin mint')}</span> ▾
          </button>
          <button className="icon-btn" onClick={() => setSheet('history')} aria-label="Historial">
            📜
          </button>
        </div>
      </header>

      <section className="balance">
        <small>en este frasco</small>
        <div className="bal">
          {fmtSats(shown)} <span>sats</span>
        </div>
        <small className="sub">
          {w.activeProofs.length} {w.activeProofs.length === 1 ? 'bellota' : 'bellotas'}
          {mintCount > 1 && ` · ${fmtSats(w.total)} sats en ${mintCount} mints`}
        </small>
        {w.inTransit > 0 && <small className="sub">⏳ {fmtSats(w.inTransit)} sats en tránsito (pago Lightning sin confirmar)</small>}
      </section>

      {empty && (
        <div className="bubble">
          <b>¡Tu frasco está vacío!</b>
          <span>
            Cada bellota es una prueba de ecash Cashu: plata digital al portador, privada como el efectivo.
          </span>
          {w.backend.isDemo ? (
            <button
              className="btn primary"
              onClick={async () => {
                try {
                  await w.actions.receiveToken(makeGiftToken(1337))
                  toast('+1.337 sats de juguete 🌰')
                } catch (e) {
                  toast(errMsg(e), 'err')
                }
              }}
            >
              Llenar con sats de juguete 🎁
            </button>
          ) : (
            <button className="btn primary" onClick={() => setSheet('receive')}>
              Recibir mis primeros sats
            </button>
          )}
        </div>
      )}

      {!empty && w.backend.seed && !w.backend.seed.backedUp() && (
        <button className="seed-nag" onClick={() => setSheet('seed')}>
          🌱 <span>Anotá tus 12 palabras para no perder tus sats</span> →
        </button>
      )}

      {!empty && <p className="poke-hint">tocá una bellota para ver cuánto vale · tocá el frasco para agitarlo</p>}

      <nav className="dock">
        <button className="dock-btn in" onClick={() => setSheet('receive')}>
          <span className="dock-ico">↓</span> Recibir
        </button>
        <button className="dock-btn shake" onClick={w.actions.shake} aria-label="Agitar el frasco" title="Agitar">
          🫨
        </button>
        <button className="dock-btn shake scan" onClick={() => setScanning(true)} aria-label="Escanear QR" title="Escanear">
          📷
        </button>
        <button className="dock-btn out" onClick={() => setSheet('send')} disabled={empty}>
          Enviar <span className="dock-ico">↑</span>
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
          } else toast('Ese QR no es un token Cashu, una invoice ni una Lightning Address', 'err')
        }}
      />
      {sheet === 'mints' && <MintsSheet w={w} onClose={close} toast={toast} onSeed={() => setSheet('seed')} />}
      {sheet === 'seed' && <SeedSheet w={w} onClose={close} toast={toast} />}
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
