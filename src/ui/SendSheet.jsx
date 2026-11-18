import { useEffect, useState } from 'react'
import { AmountInput, PasteBtn, ScanBtn, Sheet, Tabs, errMsg, fmtSats, shortUrl } from './kit.jsx'
import { classify } from '../lib/parse.js'
import { readRequest } from '../lib/request.js'
import { exactCoverage, sumOf } from '../lib/cashu.js'
import ShareToken from './ShareToken.jsx'

// Follows the browser's online/offline state; the user can also force offline mode
// (e.g. on a captive Wi-Fi or a bitchat mesh with no route to the mint).
function useOffline() {
  const [net, setNet] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false)
  const [forced, setForced] = useState(false)
  useEffect(() => {
    const on = () => setNet(false)
    const off = () => setNet(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return { offline: net || forced, noNet: net, forced, setForced }
}

// 📴 toggle + what the coins allow offline. `amount` is what the user typed.
function OfflinePanel({ w, mint, amount, off, setAmount, toast }) {
  const [busy, setBusy] = useState(false)
  if (!w.backend.sendOffline) return null
  const proofs = w.state.proofs[mint] || []
  const cover = exactCoverage(proofs)
  const opts = off.offline && amount > 0 && amount <= sumOf(proofs) ? w.actions.offlineOptions(amount, mint) : null
  return (
    <div className={`offline-box${off.offline ? ' on' : ''}`}>
      <label className="offline-toggle">
        <input type="checkbox" checked={off.offline} disabled={off.noNet} onChange={(e) => off.setForced(e.target.checked)} />
        <span>
          📴 <b>Offline send</b> {off.noNet ? '(no internet)' : ''}
        </span>
      </label>
      {off.offline ? (
        <small>Hands over coins you already have, without the mint. Only exact amounts: there's no one to give change.</small>
      ) : (
        <small>Works with no internet (bitchat, airplane mode…) as long as your coins add up to the amount.</small>
      )}
      {opts?.noCache && <p className="error">This mint was never opened online on this device, so it can't be used offline.</p>}
      {opts && !opts.ok && !opts.noCache && (
        <div className="offline-alt">
          <span>Your coins can't make exactly {fmtSats(amount)}.</span>
          {opts.below && (
            <button className="chip" onClick={() => setAmount(String(opts.below))}>
              {fmtSats(opts.below)}
            </button>
          )}
          {opts.above && (
            <button className="chip" onClick={() => setAmount(String(opts.above))}>
              {fmtSats(opts.above)}
            </button>
          )}
        </div>
      )}
      <small className="muted">
        {cover > 0 ? `Ready offline: any amount up to ~${fmtSats(cover)} sats.` : 'Your coins are big: few amounts can go out offline.'}
      </small>
      {!off.offline && proofs.length > 0 && (
        <button
          className="btn ghost small"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              const fee = await w.actions.preparePocket(mint)
              toast(`🪙 Coins ready for offline${fee ? ` (mint fee ${fmtSats(fee)} sats)` : ''}`)
            } catch (e) {
              toast(errMsg(e), 'err')
            } finally {
              setBusy(false)
            }
          }}
        >
          {busy ? 'Splitting coins…' : '🪙 Prepare coins for offline'}
        </button>
      )}
    </div>
  )
}

// Runs a send; if the mint can't be reached before anything happened, switches to offline mode.
async function attempt(fn, off, setErr) {
  try {
    return await fn()
  } catch (e) {
    if (e?.unreachable && !off.offline) {
      off.setForced(true)
      setErr("Can't reach the mint. Switched to offline send: check the amount and try again.")
    } else setErr(errMsg(e))
    return null
  }
}

function EcashOut({ w, toast, onRequest }) {
  const [amount, setAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [sent, setSent] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const off = useOffline()
  const n = Number(amount)

  if (sent) return <ShareToken token={sent.token} amount={n} offline={sent.offline} />

  return (
    <div className="stack">
      <p className="hint">Take acorns out of the jar and turn them into a token you can send as text, a QR code or an emoji.</p>
      <div className="row request-row">
        <span className="muted">Got a payment request?</span>
        <ScanBtn
          accept="request"
          hint="Point at the payment request QR (creq…)"
          onScan={onRequest}
          onWrong={() => setErr("That QR isn't a Cashu payment request.")}
        />
        <PasteBtn accept="request" onPaste={onRequest} onWrong={() => setErr("The clipboard doesn't have a payment request.")} />
      </div>
      <AmountInput value={amount} onChange={setAmount} max={w.balance} />
      <input className="text-in" placeholder="Note (optional)" value={memo} maxLength={80} onChange={(e) => setMemo(e.target.value)} />
      <OfflinePanel w={w} mint={w.state.active} amount={n} off={off} setAmount={setAmount} toast={toast} />
      {err && <p className="error">{err}</p>}
      <button
        className="btn primary xl"
        disabled={!n || n > w.balance || busy}
        onClick={async () => {
          setBusy(true)
          setErr('')
          const r = await attempt(() => w.actions.sendEcash(n, memo.trim() || undefined, { offline: off.offline }), off, setErr)
          if (r) {
            setSent(r)
            toast(`🌰 ${fmtSats(n)} sats ready to send${r.offline ? ' (offline)' : ''}`)
          }
          setBusy(false)
        }}
      >
        {busy ? 'Creating token…' : n > w.balance ? 'Not enough balance' : off.offline ? 'Create token offline 📴' : 'Create token 🌰'}
      </button>
    </div>
  )
}

// 📝 Pays a NUT-18 payment request with ecash.
function PayRequest({ w, toast, value, onBack, onDone, onMove }) {
  const [amount, setAmount] = useState('')
  const [sent, setSent] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const off = useOffline()
  let req = null
  let bad = ''
  try {
    req = readRequest(value)
  } catch (e) {
    bad = e?.message || 'Invalid payment request'
  }
  const n = req?.amount ?? Number(amount)

  // Mints I can pay from: the request's list (if strict), with enough balance; the open jar first.
  const allowed = (url) => !req?.mints.length || !req.strict || req.mints.includes(url)
  const bal = (url) => sumOf(w.state.proofs[url] || [])
  const candidates = req ? w.state.mints.map((m) => m.url).filter((u) => allowed(u) && bal(u) > 0 && bal(u) >= n) : []
  const [pick, setPick] = useState(null)
  const mint = pick && candidates.includes(pick) ? pick : candidates.includes(w.state.active) ? w.state.active : candidates[0]
  // Nothing fits but they accept a mint: offer moving sats there
  const target = req && !mint && req.mints.length ? req.mints.find((u) => !w.state.mints.some((m) => m.url === u) || bal(u) < n) : null

  if (bad)
    return (
      <div className="stack">
        <p className="error">{bad}</p>
        <button className="btn ghost" onClick={onBack}>
          ← Back
        </button>
      </div>
    )

  if (sent)
    return (
      <div className="stack center">
        <p className="hint center">
          <b>Now send this token back to whoever asked</b> (the chat where you got the request, bitchat, or let them scan the QR).
        </p>
        <ShareToken token={sent.token} amount={n} offline={sent.offline} />
      </div>
    )

  return (
    <div className="stack">
      <div className="token-card">
        <b>📝 Payment request</b>
        {req.description && <div className="memo">“{req.description}”</div>}
        {req.amount != null ? <div className="big-amount">{fmtSats(req.amount)} sats</div> : <div className="muted">No amount set: you choose.</div>}
        <div className="muted">
          {req.mints.length ? `${req.strict ? 'Only accepts' : 'Prefers'}: ${req.mints.map(shortUrl).join(', ')}` : 'Accepts any mint'}
        </div>
        {req.lock && <div className="muted">🔒 Wants ecash locked to their key: only they can claim it.</div>}
        {req.lockKind && !req.lock && <div className="warn">This request uses a lock Bellota doesn't support ({req.lockKind}).</div>}
        {req.nostr && !req.post && <div className="muted">Asks for delivery over Nostr: Bellota will give you the token to send by hand.</div>}
      </div>
      {req.amount == null && <AmountInput value={amount} onChange={setAmount} max={w.balance} />}
      {candidates.length > 1 && (
        <select className="text-in" value={mint} onChange={(e) => setPick(e.target.value)} aria-label="Pay from">
          {candidates.map((u) => (
            <option key={u} value={u}>
              From {shortUrl(u)} · {fmtSats(bal(u))} sats
            </option>
          ))}
        </select>
      )}
      {!mint && n > 0 && (
        <div className="warn">
          {target ? (
            <>
              You don't have {fmtSats(n)} sats on a mint they accept.{' '}
              <button className="btn ghost small" onClick={() => onMove(target, n)}>
                ↔️ Move sats to {shortUrl(target)}
              </button>
            </>
          ) : (
            "You don't have enough balance on a mint they accept."
          )}
        </div>
      )}
      {mint && !req.lock && <OfflinePanel w={w} mint={mint} amount={n} off={off} setAmount={setAmount} toast={toast} />}
      {err && <p className="error">{err}</p>}
      <button
        className="btn primary xl"
        disabled={!n || !mint || busy || (req.lockKind && !req.lock)}
        onClick={async () => {
          setBusy(true)
          setErr('')
          const r = await attempt(() => w.actions.payRequest(req, n, { mint, offline: off.offline && !req.lock }), off, setErr)
          setBusy(false)
          if (!r) return
          if (r.delivered) onDone(`📝 Paid ${fmtSats(n)} sats`)
          else setSent({ token: r.token, offline: off.offline })
        }}
      >
        {busy ? 'Paying…' : `Pay ${n ? fmtSats(n) + ' sats ' : ''}${off.offline && !req.lock ? '📴' : '🌰'}`}
      </button>
      <button className="btn ghost" onClick={onBack}>
        ← Back
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

export default function SendSheet({ w, onClose, toast, initialInvoice, initialRequest, onMove }) {
  const [tab, setTab] = useState(initialInvoice ? 'ln' : 'ecash')
  const [request, setRequest] = useState(initialRequest || null)
  const done = (m) => {
    toast(m)
    onClose()
  }
  if (request)
    return (
      <Sheet title="Pay request" emoji="📝" onClose={onClose}>
        <PayRequest w={w} toast={toast} value={request} onBack={() => setRequest(null)} onDone={done} onMove={onMove} />
      </Sheet>
    )
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
        <EcashOut w={w} toast={toast} onRequest={setRequest} />
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
