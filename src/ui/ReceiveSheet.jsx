import { useEffect, useRef, useState } from 'react'
import { AmountInput, CopyBtn, QR, ScanBtn, Sheet, Tabs, errMsg, fmtSats, shortUrl } from './kit.jsx'
import { makeGiftToken } from '../lib/demo.js'
import { classify } from '../lib/parse.js'

// tiny helper kept here so the image reader itself can stay lazy-loaded
const imageFrom = (dt) => [...(dt?.files || [])].find((f) => /^image\//.test(f.type))

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
  const fromEmoji = info && classify(token).emoji
  const [dragging, setDragging] = useState(false)

  // Image (screenshot, photo) → token, read from the QR code in it
  const fromImage = async (file) => {
    setErr('')
    setBusy(true)
    try {
      const { readImage } = await import('../lib/imageToken.js')
      const r = await readImage(file)
      if (r.kind !== 'token') throw new Error(r.kind === 'invoice' ? 'That image has a Lightning invoice: to pay it, go to Send → Pay Lightning.' : "That image doesn't contain a Cashu token.")
      setToken(r.value)
    } catch (e) {
      setErr(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <p className="hint">
        Paste a Cashu token (<code>cashuA…</code>/<code>cashuB…</code>) or an emoji with a token inside 🥜. You can also open a screenshot of a token QR.
      </p>
      <textarea
        className={`token-area${dragging ? ' dragging' : ''}`}
        placeholder="cashuB…  or  🥜"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        onPaste={(e) => {
          const img = imageFrom(e.clipboardData)
          if (img) {
            e.preventDefault()
            fromImage(img)
          }
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          setDragging(false)
          const img = imageFrom(e.dataTransfer)
          if (img) {
            e.preventDefault()
            fromImage(img)
          }
        }}
        spellCheck={false}
        rows={4}
      />
      {fromEmoji && <p className="muted">🥜 Found a token hidden in the emoji.</p>}
      <ScanBtn
        accept="token"
        hint="Point at the Cashu token QR"
        onScan={(v) => {
          setErr('')
          setToken(v)
        }}
        onWrong={(r) => setErr(r.kind === 'invoice' ? 'That is a Lightning invoice: to pay it, go to Send → Pay Lightning.' : "That QR isn't a Cashu token.")}
      />
      <label className="btn ghost scan-btn file-btn">
        🖼️ Open image (QR)
        <input
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) fromImage(f)
          }}
        />
      </label>
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
