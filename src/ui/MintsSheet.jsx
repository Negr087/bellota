import { useState } from 'react'
import { CopyBtn, Sheet, errMsg, fmtSats, shortUrl } from './kit.jsx'
import { SUGGESTED_MINTS } from '../lib/useWallet.js'
import { sumOf } from '../lib/cashu.js'

// ↔️ Move sats from one mint to another over Lightning (the source pays the destination's invoice).
function Transfer({ w, toast, prefill }) {
  const { mints, proofs } = w.state
  const bal = (u) => sumOf(proofs[u] || [])
  const withBal = mints.filter((m) => bal(m.url) > 0)
  const [from, setFrom] = useState(() => (prefill ? withBal.filter((m) => m.url !== prefill.to).sort((a, b) => bal(b.url) - bal(a.url))[0]?.url : w.state.active))
  const [to, setTo] = useState(() => prefill?.to || mints.find((m) => m.url !== w.state.active)?.url)
  const [amount, setAmount] = useState(prefill?.amount ? String(prefill.amount) : '')
  const [quote, setQuote] = useState(null)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const n = Number(amount)
  const name = (u) => mints.find((m) => m.url === u)?.name || shortUrl(u)

  const run = async (label, fn) => {
    setBusy(label)
    setErr('')
    try {
      await fn()
    } catch (e) {
      setErr(errMsg(e))
    } finally {
      setBusy('')
    }
  }
  const reset = () => {
    if (quote) w.actions.cancelTransfer(quote)
    setQuote(null)
  }

  return (
    <div className="transfer">
      <h3>↔️ Move sats between mints</h3>
      <p className="hint">The first mint pays a Lightning invoice from the second one. You pay the Lightning fee; whatever's unused comes back.</p>
      <div className="row">
        <select className="text-in grow" value={from || ''} disabled={!!quote} onChange={(e) => setFrom(e.target.value)} aria-label="From">
          {withBal.map((m) => (
            <option key={m.url} value={m.url}>
              From {name(m.url)} · {fmtSats(bal(m.url))}
            </option>
          ))}
        </select>
      </div>
      <div className="row">
        <select className="text-in grow" value={to || ''} disabled={!!quote} onChange={(e) => setTo(e.target.value)} aria-label="To">
          {mints
            .filter((m) => m.url !== from)
            .map((m) => (
              <option key={m.url} value={m.url}>
                To {name(m.url)}
              </option>
            ))}
        </select>
      </div>
      <div className="row">
        <input
          className="text-in grow"
          inputMode="numeric"
          placeholder="Amount (sats)"
          value={amount}
          disabled={!!quote}
          onChange={(e) => setAmount(e.target.value.replace(/\D/g, '').slice(0, 9))}
        />
        <button
          className="btn ghost"
          disabled={!from || !to || !!busy || !!quote}
          onClick={() => run('max', async () => setAmount(String(await w.actions.maxTransfer(from, to))))}
        >
          {busy === 'max' ? '…' : 'Max'}
        </button>
      </div>
      {quote && (
        <div className="token-card">
          <b>
            {fmtSats(quote.amount)} sats: {name(quote.from)} → {name(quote.to)}
          </b>
          <div className="muted">+ up to {fmtSats(quote.fee)} sats Lightning fee reserve (the rest comes back)</div>
          {quote.amount + quote.fee > bal(quote.from) && <div className="warn">Not enough on {name(quote.from)} to cover amount + fee. Try “Max”.</div>}
        </div>
      )}
      {err && <p className="error">{err}</p>}
      {!quote ? (
        <button
          className="btn primary"
          disabled={!from || !to || !n || n > bal(from) || !!busy}
          onClick={() => run('quote', async () => setQuote(await w.actions.quoteTransfer(from, to, n)))}
        >
          {busy === 'quote' ? 'Getting quote…' : n > bal(from || '') ? 'Not enough balance' : 'Get quote'}
        </button>
      ) : (
        <div className="row">
          <button
            className="btn primary grow"
            disabled={!!busy || quote.amount + quote.fee > bal(quote.from)}
            onClick={() =>
              run('pay', async () => {
                const r = await w.actions.confirmTransfer(quote)
                setQuote(null)
                setAmount('')
                toast(r === 'DONE' ? `↔️ Moved ${fmtSats(quote.amount)} sats to ${name(quote.to)}` : '⏳ Transfer in progress: check your history')
              })
            }
          >
            {busy === 'pay' ? 'Moving…' : 'Move ⚡'}
          </button>
          <button className="btn ghost" disabled={!!busy} onClick={reset}>
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

export default function MintsSheet({ w, onClose, toast, onSeed, transfer }) {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [backup, setBackup] = useState(null)
  const { mints, proofs, active } = w.state

  const add = async (u) => {
    setBusy(true)
    setErr('')
    try {
      await w.actions.addMint(u)
      setUrl('')
      toast('Mint added 🏦')
    } catch (e) {
      setErr(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet title="Mints & backup" emoji="🏦" onClose={onClose}>
      <div className="stack">
        <p className="hint">
          A <b>mint</b> issues the ecash: it holds the sats and signs your acorns. Pick which one to use; each one is its own jar.
        </p>
        <ul className="mint-list">
          {mints.map((m) => {
            const bal = sumOf(proofs[m.url] || [])
            return (
              <li key={m.url} className={m.url === active ? 'on' : ''}>
                <button className="mint-pick" onClick={() => w.actions.setActive(m.url)}>
                  <span className="radio" />
                  <span className="mint-name">
                    <b>{m.name || shortUrl(m.url)}</b>
                    <small>{shortUrl(m.url)}</small>
                  </span>
                  <span className="mint-bal">{fmtSats(bal)}</span>
                </button>
                {!bal && mints.length > 1 && (
                  <button
                    className="icon-btn small"
                    aria-label="Remove mint"
                    onClick={() => {
                      try {
                        w.actions.removeMint(m.url)
                      } catch (e) {
                        setErr(e.message)
                      }
                    }}
                  >
                    🗑
                  </button>
                )}
              </li>
            )
          })}
        </ul>

        {!w.backend.isDemo && (
          <>
            <div className="row">
              <input className="text-in grow" placeholder="https://mint.example.com" value={url} onChange={(e) => setUrl(e.target.value)} />
              <button className="btn primary" disabled={!/^https?:\/\/\S+$/.test(url.trim()) || busy} onClick={() => add(url)}>
                {busy ? '…' : 'Add'}
              </button>
            </div>
            <div className="suggest">
              {SUGGESTED_MINTS.filter((s) => !mints.some((m) => m.url === s.url)).map((s) => (
                <button key={s.url} className="chip wide" disabled={busy} onClick={() => add(s.url)}>
                  + {shortUrl(s.url)} <small>{s.note}</small>
                </button>
              ))}
            </div>
          </>
        )}
        {err && <p className="error">{err}</p>}

        {mints.length > 1 && mints.some((m) => sumOf(proofs[m.url] || []) > 0) && <Transfer w={w} toast={toast} prefill={transfer} />}

        <h3>Backup</h3>
        {w.backend.seed && (
          <>
            <p className="hint">
              Your acorns come from a <b>12-word seed</b> (NUT-13): with it you can restore your balance if you lose this browser.
            </p>
            <button className="btn primary" onClick={onSeed}>
              🌱 My 12 words / Restore
            </button>
          </>
        )}
        <p className="hint">
          {w.backend.seed ? 'You can also export' : 'Export'} one token per mint with the whole balance (works in any Cashu wallet, but it's a snapshot: it won't include anything you receive later).
        </p>
        {!backup ? (
          <button className="btn ghost" onClick={() => setBackup(w.actions.exportBackup())}>
            Export backup 🔐
          </button>
        ) : backup.length === 0 ? (
          <p className="muted">No balance to back up.</p>
        ) : (
          backup.map((b) => (
            <div key={b.mint} className="token-card">
              <b>
                {fmtSats(b.amount)} sats · {shortUrl(b.mint)}
              </b>
              <code className="mono-clip">{b.token}</code>
              <CopyBtn text={b.token}>Copy</CopyBtn>
            </div>
          ))
        )}
      </div>
    </Sheet>
  )
}
