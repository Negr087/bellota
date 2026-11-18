import { lazy, Suspense, useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { classify } from '../lib/parse.js'

const Scanner = lazy(() => import('./Scanner.jsx'))

// Full-screen scanner (loaded only when needed)
export function ScanOverlay({ open, onResult, onClose, hint }) {
  if (!open) return null
  return (
    <Suspense fallback={<div className="scanner" />}>
      <Scanner onResult={onResult} onClose={onClose} hint={hint} />
    </Suspense>
  )
}

// 📷 button that fills a field from a QR code. `accept` filters the kind ('token' | 'invoice' | 'address', or a list).
export function ScanBtn({ onScan, accept, hint, onWrong }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="btn ghost scan-btn" onClick={() => setOpen(true)}>
        📷 Scan
      </button>
      <ScanOverlay
        open={open}
        hint={hint}
        onClose={() => setOpen(false)}
        onResult={(raw) => {
          setOpen(false)
          const r = classify(raw)
          if (accept && ![].concat(accept).includes(r.kind)) onWrong?.(r)
          else onScan(r.value)
        }}
      />
    </>
  )
}

// 📋 button that reads the clipboard (e.g. a token copied from bitchat or any chat).
export function PasteBtn({ onPaste, accept, onWrong, label = '📋 Paste' }) {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) return null
  return (
    <button
      type="button"
      className="btn ghost scan-btn"
      onClick={async () => {
        let text = ''
        try {
          text = await navigator.clipboard.readText()
        } catch {
          return onWrong?.({ kind: 'denied' })
        }
        const r = classify(text)
        if (accept && ![].concat(accept).includes(r.kind)) onWrong?.(r)
        else onPaste(r.value)
      }}
    >
      {label}
    </button>
  )
}

export function Sheet({ title, emoji, onClose, children }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="sheet-wrap" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="sheet" role="dialog" aria-label={title}>
        <header className="sheet-head">
          <h2>
            <span className="sheet-emoji">{emoji}</span> {title}
          </h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="sheet-body">{children}</div>
      </section>
    </div>
  )
}

export function Tabs({ value, onChange, options }) {
  return (
    <div className="tabs" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function QR({ value, label }) {
  const [src, setSrc] = useState(null)
  const [err, setErr] = useState(false)
  useEffect(() => {
    let alive = true
    setErr(false)
    QRCode.toDataURL(value.toUpperCase().startsWith('LN') ? value.toUpperCase() : value, {
      margin: 1,
      width: 520,
      errorCorrectionLevel: 'L',
      color: { dark: '#2B1D14', light: '#FFFDF7' },
    })
      .then((u) => alive && setSrc(u))
      .catch(() => alive && setErr(true))
    return () => {
      alive = false
    }
  }, [value])
  if (err) return <div className="qr qr-too-big">Too long for a QR code — use the copy button 📋</div>
  return <div className="qr">{src ? <img src={src} alt={label || 'QR code'} /> : <div className="qr-loading" />}</div>
}

// A token too long for one comfortable QR becomes an animated one (BC-UR frames, like cashu.me):
// the other wallet keeps scanning until it has every piece. Short ones stay a plain QR.
const ANIMATE_OVER = 450 // characters
const qrOpts = { margin: 1, width: 520, errorCorrectionLevel: 'L', color: { dark: '#2B1D14', light: '#FFFDF7' } }

export function TokenQR({ value, label }) {
  const long = value.length > ANIMATE_OVER
  const [animated, setAnimated] = useState(long)
  const [frames, setFrames] = useState(null) // data URLs, shown in a loop
  const [i, setI] = useState(0)
  const [speed, setSpeed] = useState(1)

  useEffect(() => {
    if (!animated) return
    let alive = true
    setFrames(null)
    ;(async () => {
      const { encodeParts } = await import('../lib/animqr.js')
      const enc = encodeParts(value)
      // Fountain frames never repeat exactly; a few laps' worth is plenty for any scanner.
      const parts = enc.first(Math.min(240, Math.max(enc.count * 3, 20)))
      const urls = await Promise.all(parts.map((p) => QRCode.toDataURL(p, qrOpts)))
      if (alive) setFrames(urls)
    })().catch(() => alive && setAnimated(false))
    return () => {
      alive = false
    }
  }, [value, animated])

  useEffect(() => {
    if (!animated || !frames) return
    const t = setInterval(() => setI((n) => (n + 1) % frames.length), [250, 150, 400][speed - 1] ?? 250)
    return () => clearInterval(t)
  }, [animated, frames, speed])

  return (
    <>
      {animated ? (
        <div className="qr">{frames ? <img src={frames[i % frames.length]} alt={`${label || 'QR code'} (animated)`} /> : <div className="qr-loading" />}</div>
      ) : (
        <QR value={value} label={label} />
      )}
      {long && (
        <div className="row qr-mode">
          <button className={`chip${animated ? ' on' : ''}`} onClick={() => setAnimated(true)}>
            🎞️ Animated
          </button>
          <button className={`chip${!animated ? ' on' : ''}`} onClick={() => setAnimated(false)}>
            ▢ Single
          </button>
          {animated && (
            <button className="chip" onClick={() => setSpeed((s) => (s % 3) + 1)} aria-label="Change speed">
              {['Normal', 'Fast', 'Slow'][speed - 1]}
            </button>
          )}
        </div>
      )}
      {long && animated && <p className="muted center small-print">Long token: keep the other camera pointed until it fills up.</p>}
    </>
  )
}

export function CopyBtn({ text, children = 'Copy', className = 'btn' }) {
  const [ok, setOk] = useState(false)
  return (
    <button
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setOk(true)
          setTimeout(() => setOk(false), 1400)
        } catch {
          /* no clipboard permission: the text is still visible to copy by hand */
        }
      }}
    >
      {ok ? 'Copied! ✓' : children}
    </button>
  )
}

const CHIPS = [21, 100, 210, 1000, 2100]
export function AmountInput({ value, onChange, max }) {
  return (
    <div className="amount-input">
      <div className="amount-field">
        <input
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="0"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 9))}
          autoFocus
        />
        <span>sats</span>
      </div>
      <div className="chips">
        {CHIPS.map((c) => (
          <button key={c} className="chip" onClick={() => onChange(String(c))} disabled={max != null && c > max}>
            {c.toLocaleString('en-US')}
          </button>
        ))}
        {max != null && max > 0 && (
          <button className="chip" onClick={() => onChange(String(max))}>
            max
          </button>
        )}
      </div>
    </div>
  )
}

// PWA install state: Android/desktop give us a prompt; iOS needs "Share → Add to Home Screen".
export function useInstall() {
  const standalone =
    typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true)
  const ios = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)
  const [prompt, setPrompt] = useState(() => (typeof window !== 'undefined' ? window.__installPrompt : null))
  useEffect(() => {
    const on = () => setPrompt(window.__installPrompt)
    const off = () => setPrompt(null)
    window.addEventListener('bellota:installable', on)
    window.addEventListener('appinstalled', off)
    return () => {
      window.removeEventListener('bellota:installable', on)
      window.removeEventListener('appinstalled', off)
    }
  }, [])
  return {
    standalone,
    ios: ios && !standalone,
    canInstall: !!prompt && !standalone,
    async install() {
      if (!prompt) return
      prompt.prompt()
      await prompt.userChoice.catch(() => null)
      window.__installPrompt = null
      setPrompt(null)
    },
  }
}

export const fmtSats = (n) => Number(n || 0).toLocaleString('en-US')
export const shortUrl = (u) => {
  try {
    const x = new URL(u)
    return x.host + (x.pathname !== '/' ? x.pathname : '')
  } catch {
    return u
  }
}
export const errMsg = (e) => {
  const m = e?.message || String(e)
  if (/fetch|network|Failed to/i.test(m)) return "Can't reach the mint. Is the URL right, and are you online?"
  return m
}
