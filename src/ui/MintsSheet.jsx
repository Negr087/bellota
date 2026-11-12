import { useState } from 'react'
import { CopyBtn, Sheet, errMsg, fmtSats, shortUrl } from './kit.jsx'
import { SUGGESTED_MINTS } from '../lib/useWallet.js'
import { sumOf } from '../lib/cashu.js'

export default function MintsSheet({ w, onClose, toast, onSeed }) {
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
