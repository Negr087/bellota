import { useEffect, useRef, useState } from 'react'
import { AmountInput, CopyBtn, PasteBtn, QR, ScanBtn, Sheet, Tabs, errMsg, fmtSats, shortUrl } from './kit.jsx'
import { makeGiftToken } from '../lib/demo.js'
import { classify } from '../lib/parse.js'
import { makeRequest } from '../lib/request.js'

// 📴 What we can tell about a token with no internet, in plain words.
// Returns { tone: 'ok'|'warn'|'bad', title, text, canKeep }.
export function describeVerdict(v) {
  if (!v) return null
  if (v.unit !== 'sat') return { tone: 'bad', title: 'Not sats', text: `This token is in ${v.unit}.`, canKeep: false }
  if (!v.known)
    return {
      tone: 'warn',
      title: '⚠️ Can’t check it offline',
      text: 'This mint was never opened on this device, so there are no keys to verify the coins with. Keep it only if you trust the sender.',
      canKeep: true,
    }
  if (v.dleq === 'bad') return { tone: 'bad', title: '❌ Forged or damaged', text: "The mint's signature doesn't match these coins. Don't accept it.", canKeep: false }
  if (v.lock === 'other' || v.lock === 'mixed')
    return { tone: 'bad', title: '❌ Locked to someone else', text: 'Only the owner of another key can claim these coins.', canKeep: false }
  const later = v.locktime ? ` After ${new Date(v.locktime * 1000).toLocaleString()} the sender can take it back if you haven’t claimed it.` : ''
  if (v.lock === 'me' && v.dleq === 'ok')
    return {
      tone: 'ok',
      title: '🔒✅ Safe: locked to you and signed by the mint',
      text: `Nobody else can spend these coins, not even the sender.${later}`,
      canKeep: true,
    }
  if (v.lock === 'me')
    return { tone: 'warn', title: '🔒 Locked to you, signature not included', text: `Only you can claim it, but the token doesn't carry the mint's proof (DLEQ), so it could be fake.${later}`, canKeep: true }
  if (v.dleq === 'ok')
    return {
      tone: 'warn',
      title: '✅ Real coins, signed by the mint',
      text: 'But the sender could still spend them somewhere else before you claim them. Fine for small amounts from people you trust.',
      canKeep: true,
    }
  return { tone: 'warn', title: '⚠️ Can’t verify', text: "The token doesn't carry the mint's proof (DLEQ), so it could be fake or already spent.", canKeep: true }
}

function OfflineVerdict({ w, token, onKept }) {
  const [v, setV] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    let alive = true
    setV(null)
    w.actions
      .checkOffline(token)
      .then((r) => alive && setV(r))
      .catch((e) => alive && setErr(errMsg(e)))
    return () => {
      alive = false
    }
  }, [token, w.actions])
  const d = describeVerdict(v)
  if (err) return <p className="error">{err}</p>
  if (!d) return <p className="muted">Checking the coins offline…</p>
  return (
    <div className={`verdict ${d.tone}`}>
      <b>{d.title}</b>
      <span>{d.text}</span>
      {d.canKeep && (
        <button
          className="btn primary"
          onClick={() => {
            try {
              const amt = w.actions.parkToken(token, v)
              onKept(`📴 ${fmtSats(amt)} sats kept: they'll be claimed as soon as you're online`)
            } catch (e) {
              setErr(errMsg(e))
            }
          }}
        >
          📴 Keep it, claim when online
        </button>
      )}
    </div>
  )
}

// 📝 Payment request (NUT-18): a QR that says "pay me X sats on one of my mints".
// The payer answers with a token over any channel, so this works over bitchat or offline too.
function RequestIn({ w, onToken }) {
  const [amount, setAmount] = useState('')
  const [desc, setDesc] = useState('')
  const [req, setReq] = useState(null)
  const [err, setErr] = useState('')
  const [pub, setPub] = useState(null) // my P2PK key, if this wallet has a seed
  const [lock, setLock] = useState(false)
  useEffect(() => {
    w.backend.p2pkPubkey?.().then(setPub).catch(() => {})
  }, [w.backend])
  const mints = w.state.mints.map((m) => m.url)
  const n = Number(amount)

  if (req)
    return (
      <div className="stack center">
        <QR value={req.code} label="Payment request" />
        <p className="big-amount">{req.amount ? `${fmtSats(req.amount)} sats` : 'Any amount'}</p>
        {req.desc && <p className="memo">“{req.desc}”</p>}
        {req.lock && <p className="muted center">🔒 Locked to your key: safe to accept offline.</p>}
        <p className="hint center">
          Show this QR or send it in any chat. Their wallet pays it with a Cashu token: when it comes back, paste or scan it here.
        </p>
        <div className="row">
          <CopyBtn text={req.code} className="btn primary">
            Copy request 📋
          </CopyBtn>
          {navigator.share && (
            <button className="btn ghost" onClick={() => navigator.share({ text: req.code }).catch(() => {})}>
              Share
            </button>
          )}
        </div>
        <code className="mono-clip">{req.code}</code>
        <div className="row">
          <PasteBtn label="📋 Paste their token" accept="token" onPaste={onToken} onWrong={() => setErr("The clipboard doesn't have a Cashu token yet.")} />
          <ScanBtn accept="token" hint="Point at their token QR" onScan={onToken} onWrong={() => setErr("That QR isn't a Cashu token.")} />
        </div>
        {err && <p className="error">{err}</p>}
      </div>
    )

  return (
    <div className="stack">
      <p className="hint">
        Ask for a payment: anyone with a Cashu wallet scans it and pays you in ecash on one of your mints ({mints.map(shortUrl).join(', ')}).
      </p>
      <AmountInput value={amount} onChange={setAmount} />
      <input className="text-in" placeholder="What is it for? (optional)" value={desc} maxLength={80} onChange={(e) => setDesc(e.target.value)} />
      {pub && (
        <label className="offline-toggle lock-toggle">
          <input type="checkbox" checked={lock} onChange={(e) => setLock(e.target.checked)} />
          <span>
            🔒 <b>Only I can claim it</b>
            <small>The payer locks the ecash to your key: you can accept it safely even with no internet. They need internet to pay.</small>
          </span>
        </label>
      )}
      {err && <p className="error">{err}</p>}
      <button
        className="btn primary xl"
        onClick={() => {
          try {
            const code = makeRequest({ amount: n || undefined, description: desc.trim(), mints, pubkey: lock && pub ? pub : undefined })
            setReq({ code, amount: n, desc: desc.trim(), lock: lock && !!pub })
          } catch (e) {
            setErr(errMsg(e))
          }
        }}
      >
        {n ? `Request ${fmtSats(n)} sats 📝` : 'Request any amount 📝'}
      </button>
    </div>
  )
}

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
  const [netDown, setNetDown] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false)
  useEffect(() => {
    const on = () => setNetDown(false)
    const off = () => setNetDown(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  const offlineMode = netDown && !!w.backend.checkOffline

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
      <PasteBtn
        accept="token"
        onPaste={(v) => {
          setErr('')
          setToken(v)
        }}
        onWrong={(r) => setErr(r.kind === 'denied' ? 'Paste it into the box above.' : "The clipboard doesn't have a Cashu token.")}
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
      {info && offlineMode && <OfflineVerdict w={w} token={token} onKept={onDone} />}
      {!offlineMode && (
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
              // Mint unreachable: fall back to checking it offline and keeping it for later
              if (w.backend.checkOffline && (e?.unreachable || /fetch|network|Failed to/i.test(e?.message || ''))) setNetDown(true)
              else setErr(errMsg(e))
            } finally {
              setBusy(false)
            }
          }}
        >
          {busy ? 'Claiming…' : 'Claim token 🌰'}
        </button>
      )}
    </div>
  )
}

export default function ReceiveSheet({ w, onClose, toast, initialToken }) {
  const [tab, setTab] = useState(initialToken ? 'ecash' : 'ln')
  const [got, setGot] = useState(initialToken) // a token pasted on the request screen
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
          { value: 'req', label: '📝 Request' },
        ]}
      />
      {tab === 'ln' && <LightningIn w={w} onDone={done} />}
      {tab === 'ecash' && <EcashIn key={got || ''} w={w} onDone={done} initial={got} />}
      {tab === 'req' && (
        <RequestIn
          w={w}
          onToken={(t) => {
            setGot(t)
            setTab('ecash')
          }}
        />
      )}
    </Sheet>
  )
}
