import { useEffect, useRef, useState } from 'react'
import { AmountInput, CopyBtn, QR, Sheet, Tabs, errMsg, fmtSats, shortUrl } from './kit.jsx'
import { makeGiftToken } from '../lib/demo.js'

function LightningIn({ w, onDone }) {
  const [amount, setAmount] = useState('')
  const [inv, setInv] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const alive = useRef(true)
  const doneRef = useRef(onDone)
  doneRef.current = onDone
  useEffect(() => {
    alive.current = true
    return () => (alive.current = false)
  }, [])

  useEffect(() => {
    if (!inv) return
    let stop = false
    const loop = async () => {
      while (!stop && alive.current) {
        try {
          const st = await w.actions.pollInvoice(inv)
          if (st === 'CLAIMED' || st === 'ISSUED') {
            doneRef.current(`+${fmtSats(inv.amount)} sats cayeron al frasco 🌰`)
            return
          }
        } catch (e) {
          setErr(errMsg(e))
        }
        await new Promise((r) => setTimeout(r, 2500))
      }
    }
    loop()
    return () => {
      stop = true
    }
  }, [inv, w.actions])

  if (inv)
    return (
      <div className="stack center">
        <QR value={inv.request} label="Invoice Lightning" />
        <p className="big-amount">{fmtSats(inv.amount)} sats</p>
        <p className="waiting">
          <span className="dot" /> Esperando el pago…
        </p>
        <div className="row">
          <CopyBtn text={inv.request}>Copiar invoice</CopyBtn>
          <a className="btn ghost" href={`lightning:${inv.request}`}>
            Abrir wallet ⚡
          </a>
        </div>
        <code className="mono-clip">{inv.request}</code>
        {err && <p className="error">{err}</p>}
      </div>
    )

  const n = Number(amount)
  return (
    <div className="stack">
      <p className="hint">
        Pagás una invoice Lightning y el mint <b>{shortUrl(w.state.active)}</b> te da bellotas (ecash) por el mismo monto.
      </p>
      <AmountInput value={amount} onChange={setAmount} />
      {err && <p className="error">{err}</p>}
      <button
        className="btn primary xl"
        disabled={!n || busy}
        onClick={async () => {
          setBusy(true)
          setErr('')
          try {
            setInv(await w.actions.createInvoice(n))
          } catch (e) {
            setErr(errMsg(e))
          } finally {
            setBusy(false)
          }
        }}
      >
        {busy ? 'Pidiendo invoice…' : 'Crear invoice ⚡'}
      </button>
    </div>
  )
}

function EcashIn({ w, onDone }) {
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  let info = null
  let bad = false
  if (token.trim()) {
    try {
      info = w.actions.tokenInfo(token)
    } catch {
      bad = true
    }
  }
  const known = info && w.state.mints.some((m) => m.url === info.mint.replace(/\/+$/, ''))
  return (
    <div className="stack">
      <p className="hint">Pegá un token Cashu (empieza con <code>cashuA</code> o <code>cashuB</code>) para guardarlo en el frasco.</p>
      <textarea
        className="token-area"
        placeholder="cashuB…"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        spellCheck={false}
        rows={4}
      />
      {w.backend.isDemo && !token && (
        <button className="btn ghost" onClick={() => setToken(makeGiftToken(21 * Math.ceil(Math.random() * 30)))}>
          🎁 Generar un token de regalo (demo)
        </button>
      )}
      {bad && <p className="error">Eso no parece un token Cashu válido.</p>}
      {info && (
        <div className="token-card">
          <div className="big-amount">{fmtSats(info.amount)} sats</div>
          <div className="muted">de {shortUrl(info.mint)}</div>
          {info.memo && <div className="memo">“{info.memo}”</div>}
          {!known && <div className="warn">Es un mint nuevo para vos: lo voy a agregar a tu lista. Solo aceptá tokens de mints en los que confíes.</div>}
        </div>
      )}
      {err && <p className="error">{err}</p>}
      <button
        className="btn primary xl"
        disabled={!info || busy}
        onClick={async () => {
          setBusy(true)
          setErr('')
          try {
            const amt = await w.actions.receiveToken(token)
            onDone(`+${fmtSats(amt)} sats cobrados 🌰`)
          } catch (e) {
            setErr(errMsg(e))
          } finally {
            setBusy(false)
          }
        }}
      >
        {busy ? 'Cobrando…' : 'Cobrar token 🌰'}
      </button>
    </div>
  )
}

export default function ReceiveSheet({ w, onClose, toast }) {
  const [tab, setTab] = useState('ln')
  const done = (msg) => {
    toast(msg)
    onClose()
  }
  return (
    <Sheet title="Recibir" emoji="📥" onClose={onClose}>
      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { value: 'ln', label: '⚡ Lightning' },
          { value: 'ecash', label: '🌰 Ecash' },
        ]}
      />
      {tab === 'ln' ? <LightningIn w={w} onDone={done} /> : <EcashIn w={w} onDone={done} />}
    </Sheet>
  )
}
