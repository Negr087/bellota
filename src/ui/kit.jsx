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
