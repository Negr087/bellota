import { useEffect, useState } from 'react'
import { AmountInput, CopyBtn, QR, ScanBtn, Sheet, Tabs, errMsg, fmtSats } from './kit.jsx'
import { classify } from '../lib/parse.js'

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
        <QR value={token} label="Cashu token" />
        <p className="big-amount">{fmtSats(n)} sats</p>
        <p className="hint center">
          Send this token to anyone (chat, email, Nostr, a scrap of paper…). They can claim it with any Cashu wallet. If nobody claims it, you can reclaim it from your history.
        </p>
        <div className="row">
          <CopyBtn text={token} className="btn primary">
            Copy token 📋
          </CopyBtn>
          {navigator.share && (
            <button className="btn ghost" onClick={() => navigator.share({ text: token }).catch(() => {})}>
              Share
            </button>
          )}
        </div>
        <code className="mono-clip">{token}</code>
      </div>
    )

  return (
    <div className="stack">
      <p className="hint">Take acorns out of the jar and turn them into a token you can send as text or a QR code.</p>
      <AmountInput value={amount} onChange={setAmount} max={w.balance} />
      <input className="text-in" placeholder="Note (optional)" value={memo} maxLength={80} onChange={(e) => setMemo(e.target.value)} />
      {err && <p className="error">{err}</p>}
      <button
        className="btn primary xl"
        disabled={!n || n > w.balance || busy}
        onClick={async () => {
          setBusy(true)
          setErr('')
          try {
            setToken(await w.actions.sendEcash(n, memo.trim() || undefined))
            toast(`🌰 ${fmtSats(n)} sats ready to send`)
          } catch (e) {
            setErr(errMsg(e))
          } finally {
            setBusy(false)
          }
        }}
      >
        {busy ? 'Creating token…' : n > w.balance ? 'Not enough balance' : 'Create token 🌰'}
      </button>
    </div>
  )
}

function LightningOut({ w, onDone, initial = '' }) {
  const [text, setText] = useState(initial)
  const [quote, setQuote] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  // Lightning Address / LNURL
  const [target, setTarget] = useState(null) // what the recipient accepts
  const [looking, setLooking] = useState(false)
  const [amount, setAmount] = useState('')
  const [comment, setComment] = useState('')

  const kind = classify(text).kind
  const isAddr = kind === 'address'
  const value = classify(text).value
  const n = Number(amount)

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

  // Coming from the scanner with an invoice: quote it right away
  useEffect(() => {
    if (initial && classify(initial).kind === 'invoice') run(async () => setQuote(await w.actions.meltQuote(initial)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // When an address is typed, look up what it accepts (debounced so we don't query on every keystroke)
  useEffect(() => {
    setTarget(null)
    if (!isAddr) return
    let alive = true
    setLooking(true)
    const t = setTimeout(async () => {
      try {
        const info = await w.actions.resolvePayTarget(value)
        if (alive) {
          setTarget(info)
          setErr('')
        }
      } catch (e) {
        if (alive) setErr(errMsg(e))
      } finally {
        if (alive) setLooking(false)
      }
    }, 500)
    return () => {
      alive = false
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAddr, value])

  const max = target ? Math.min(target.max, w.balance) : w.balance
  const amountOk = target && n >= target.min && n <= target.max

  return (
    <div className="stack">
      <p className="hint">Paste an invoice or a Lightning Address (user@domain): the mint pays it and the acorns needed melt away.</p>
      <textarea
        className="token-area"
        rows={isAddr ? 1 : 3}
        placeholder="lnbc… or user@domain.com"
        spellCheck={false}
        autoCapitalize="none"
        autoComplete="off"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setQuote(null)
          setErr('')
        }}
      />
      {!quote && (
        <ScanBtn
          accept={['invoice', 'address']}
          hint="Point at the invoice or address QR"
          onScan={(v) => {
            setErr('')
            setText(v)
            if (classify(v).kind === 'invoice') run(async () => setQuote(await w.actions.meltQuote(v)))
          }}
          onWrong={(r) => setErr(r.kind === 'token' ? 'That is a Cashu token: to claim it, go to Receive → Ecash.' : "That QR isn't an invoice or a Lightning Address.")}
        />
      )}

      {isAddr && !quote && (
        <>
          {looking && <p className="muted">Looking up {value}…</p>}
          {target && (
            <>
              <div className="token-card">
                <b>⚡ {target.target.startsWith('lnurl') ? target.domain : target.target}</b>
                {target.desc && <div className="muted">{target.desc}</div>}
                <div className="muted">
                  Accepts {fmtSats(target.min)} to {fmtSats(target.max)} sats
                </div>
              </div>
              <AmountInput value={amount} onChange={setAmount} max={max} />
              {target.commentAllowed > 0 && (
                <input
                  className="text-in"
                  placeholder="Message (optional)"
                  value={comment}
                  maxLength={target.commentAllowed}
                  onChange={(e) => setComment(e.target.value)}
                />
              )}
            </>
          )}
        </>
      )}

      {quote && (
        <div className="token-card">
          {quote.to && <b>⚡ to {quote.to}</b>}
          <div className="big-amount">{fmtSats(quote.amount)} sats</div>
          <div className="muted">+ up to {fmtSats(quote.fee)} sats fee reserve (whatever's left comes back)</div>
          {quote.memo && <div className="memo">“{quote.memo}”</div>}
          {quote.amount + quote.fee > w.balance && <div className="warn">Not enough: you have {fmtSats(w.balance)} sats on this mint.</div>}
        </div>
      )}
      {err && <p className="error">{err}</p>}
      {!quote ? (
        isAddr ? (
          <button
            className="btn primary xl"
            disabled={!amountOk || busy}
            onClick={() => run(async () => setQuote(await w.actions.quoteAddress(target, n, comment.trim())))}
          >
            {busy ? 'Requesting invoice…' : target && n && !amountOk ? `Between ${fmtSats(target.min)} and ${fmtSats(target.max)} sats` : 'Get quote'}
          </button>
        ) : (
          <button className="btn primary xl" disabled={!text.trim() || busy} onClick={() => run(async () => setQuote(await w.actions.meltQuote(value)))}>
            {busy ? 'Checking…' : 'Get quote'}
          </button>
        )
      ) : (
        <>
          <button
            className="btn primary xl"
            disabled={busy || quote.amount + quote.fee > w.balance}
            onClick={() =>
              run(async () => {
                const st = await w.actions.payInvoice(quote)
                onDone(
                  st === 'PENDING'
                    ? '⏳ Payment in progress: check your history'
                    : `⚡ Paid ${fmtSats(quote.amount)} sats${quote.to ? ` to ${quote.to}` : ''}`,
                )
              })
            }
          >
            {busy ? 'Paying…' : `Pay ${fmtSats(quote.amount)} sats ⚡`}
          </button>
          {quote.to && !busy && (
            <button className="btn ghost" onClick={() => setQuote(null)}>
              Change amount
            </button>
          )}
        </>
      )}
    </div>
  )
}

export default function SendSheet({ w, onClose, toast, initialInvoice }) {
  const [tab, setTab] = useState(initialInvoice ? 'ln' : 'ecash')
  return (
    <Sheet title="Send" emoji="📤" onClose={onClose}>
      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { value: 'ecash', label: '🌰 Ecash' },
          { value: 'ln', label: '⚡ Pay Lightning' },
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
