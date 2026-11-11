import { useEffect, useRef, useState } from 'react'
import { AmountInput, CopyBtn, QR, ScanBtn, Sheet, Tabs, errMsg, fmtSats, shortUrl } from './kit.jsx'
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
            doneRef.current(`+${fmtSats(inv.amount)} sats dropped into the jar 🌰`)
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
        <QR value={inv.request} label="Lightning invoice" />
        <p className="big-amount">{fmtSats(inv.amount)} sats</p>
        <p className="waiting">
          <span className="dot" /> Waiting for payment…
        </p>
        <div className="row">
          <CopyBtn text={inv.request}>Copy invoice</CopyBtn>
          <a className="btn ghost" href={`lightning:${inv.request}`}>
            Open wallet ⚡
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
        Pay a Lightning invoice and the mint <b>{shortUrl(w.state.active)}</b> gives you acorns (ecash) for the same amount.
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
        {busy ? 'Requesting invoice…' : 'Create invoice ⚡'}
      </button>
    </div>
  )
}

function EcashIn({ w, onDone, initial = '' }) {
  const [token, setToken] = useState(initial)
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
      <p className="hint">Paste a Cashu token (starts with <code>cashuA</code> or <code>cashuB</code>) to put it in the jar.</p>
      <textarea
        className="token-area"
        placeholder="cashuB…"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        spellCheck={false}
        rows={4}
      />
      <ScanBtn
        accept="token"
        hint="Point at the Cashu token QR"
        onScan={(v) => {
          setErr('')
          setToken(v)
        }}
        onWrong={(r) => setErr(r.kind === 'invoice' ? 'That is a Lightning invoice: to pay it, go to Send → Pay Lightning.' : "That QR isn't a Cashu token.")}
      />
      {w.backend.isDemo && !token && (
        <button className="btn ghost" onClick={() => setToken(makeGiftToken(21 * Math.ceil(Math.random() * 30)))}>
          🎁 Generate a gift token (demo)
        </button>
      )}
      {bad && <p className="error">That doesn't look like a valid Cashu token.</p>}
      {info && (
        <div className="token-card">
          <div className="big-amount">{fmtSats(info.amount)} sats</div>
          <div className="muted">from {shortUrl(info.mint)}</div>
          {info.memo && <div className="memo">“{info.memo}”</div>}
          {!known && <div className="warn">This mint is new to you: it will be added to your list. Only accept tokens from mints you trust.</div>}
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
            onDone(`+${fmtSats(amt)} sats claimed 🌰`)
          } catch (e) {
            setErr(errMsg(e))
          } finally {
            setBusy(false)
          }
        }}
      >
        {busy ? 'Claiming…' : 'Claim token 🌰'}
      </button>
    </div>
  )
}

export default function ReceiveSheet({ w, onClose, toast, initialToken }) {
  const [tab, setTab] = useState(initialToken ? 'ecash' : 'ln')
  const done = (msg) => {
    toast(msg)
    onClose()
  }
  return (
    <Sheet title="Receive" emoji="📥" onClose={onClose}>
      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { value: 'ln', label: '⚡ Lightning' },
          { value: 'ecash', label: '🌰 Ecash' },
        ]}
      />
      {tab === 'ln' ? <LightningIn w={w} onDone={done} /> : <EcashIn w={w} onDone={done} initial={initialToken} />}
    </Sheet>
  )
}
