import { useEffect, useState } from 'react'
import { AmountInput, CopyBtn, QR, ScanBtn, Sheet, Tabs, errMsg, fmtSats } from './kit.jsx'

function EcashOut({ w, toast }) {
  const [amount, setAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [token, setToken] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const n = Number(amount)

  if (token)
    return (
      <div className="stack center">
        <QR value={token} label="Token Cashu" />
        <p className="big-amount">{fmtSats(n)} sats</p>
        <p className="hint center">
          Mandale este token a quien quieras (chat, mail, Nostr, papelito…). Lo cobra con cualquier wallet Cashu. Si nadie lo cobra, lo podés recuperar desde el historial.
        </p>
        <div className="row">
          <CopyBtn text={token} className="btn primary">
            Copiar token 📋
          </CopyBtn>
          {navigator.share && (
            <button className="btn ghost" onClick={() => navigator.share({ text: token }).catch(() => {})}>
              Compartir
            </button>
          )}
        </div>
        <code className="mono-clip">{token}</code>
      </div>
    )

  return (
    <div className="stack">
      <p className="hint">Sacás bellotas del frasco y las convertís en un token que se puede mandar como texto o QR.</p>
      <AmountInput value={amount} onChange={setAmount} max={w.balance} />
      <input className="text-in" placeholder="Nota (opcional)" value={memo} maxLength={80} onChange={(e) => setMemo(e.target.value)} />
      {err && <p className="error">{err}</p>}
      <button
        className="btn primary xl"
        disabled={!n || n > w.balance || busy}
        onClick={async () => {
          setBusy(true)
          setErr('')
          try {
            setToken(await w.actions.sendEcash(n, memo.trim() || undefined))
            toast(`🌰 ${fmtSats(n)} sats listos para mandar`)
          } catch (e) {
            setErr(errMsg(e))
          } finally {
            setBusy(false)
          }
        }}
      >
        {busy ? 'Armando token…' : n > w.balance ? 'No te alcanza' : 'Crear token 🌰'}
      </button>
    </div>
  )
}

function LightningOut({ w, onDone, initial = '' }) {
  const [invoice, setInvoice] = useState(initial)
  const [quote, setQuote] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const run = async (fn) => {
    setBusy(true)
    setErr('')
    try {
      await fn()
    } catch (e) {
      setErr(errMsg(e))
    } finally {
      setBusy(false)
    }
  }
  // Si venimos del escáner con una invoice, cotizamos de una
  useEffect(() => {
    if (initial) run(async () => setQuote(await w.actions.meltQuote(initial)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div className="stack">
      <p className="hint">Pegá una invoice Lightning: el mint la paga y se derriten las bellotas necesarias.</p>
      <textarea
        className="token-area"
        rows={3}
        placeholder="lnbc…"
        spellCheck={false}
        value={invoice}
        onChange={(e) => {
          setInvoice(e.target.value)
          setQuote(null)
        }}
      />
      {!quote && (
        <ScanBtn
          accept="invoice"
          hint="Apuntá al QR de la invoice Lightning"
          onScan={(v) => {
            setErr('')
            setInvoice(v)
            run(async () => setQuote(await w.actions.meltQuote(v)))
          }}
          onWrong={(r) => setErr(r.kind === 'token' ? 'Eso es un token Cashu: para cobrarlo andá a Recibir → Ecash.' : 'Ese QR no es una invoice Lightning.')}
        />
      )}
      {quote && (
        <div className="token-card">
          <div className="big-amount">{fmtSats(quote.amount)} sats</div>
          <div className="muted">+ hasta {fmtSats(quote.fee)} sats de reserva de comisión (lo que sobre vuelve)</div>
          {quote.amount + quote.fee > w.balance && <div className="warn">No te alcanza: tenés {fmtSats(w.balance)} sats en este mint.</div>}
        </div>
      )}
      {err && <p className="error">{err}</p>}
      {!quote ? (
        <button className="btn primary xl" disabled={!invoice.trim() || busy} onClick={() => run(async () => setQuote(await w.actions.meltQuote(invoice)))}>
          {busy ? 'Consultando…' : 'Ver cuánto sale'}
        </button>
      ) : (
        <button
          className="btn primary xl"
          disabled={busy || quote.amount + quote.fee > w.balance}
          onClick={() =>
            run(async () => {
              const st = await w.actions.payInvoice(quote)
              onDone(st === 'PENDING' ? '⏳ Pago en curso: te avisamos en el historial' : `⚡ Pagaste ${fmtSats(quote.amount)} sats`)
            })
          }
        >
          {busy ? 'Pagando…' : `Pagar ${fmtSats(quote.amount)} sats ⚡`}
        </button>
      )}
    </div>
  )
}

export default function SendSheet({ w, onClose, toast, initialInvoice }) {
  const [tab, setTab] = useState(initialInvoice ? 'ln' : 'ecash')
  return (
    <Sheet title="Enviar" emoji="📤" onClose={onClose}>
      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { value: 'ecash', label: '🌰 Ecash' },
          { value: 'ln', label: '⚡ Pagar Lightning' },
        ]}
      />
      {tab === 'ecash' ? (
        <EcashOut w={w} toast={toast} />
      ) : (
        <LightningOut
          w={w}
          initial={initialInvoice}
          onDone={(m) => {
            toast(m)
            onClose()
          }}
        />
      )}
    </Sheet>
  )
}
