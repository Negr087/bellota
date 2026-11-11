import { useState } from 'react'
import { CopyBtn, Sheet, Tabs, errMsg, fmtSats, shortUrl } from './kit.jsx'
import { SUGGESTED_MINTS } from '../lib/useWallet.js'
import { isValidMnemonic, normalizeWords } from '../lib/seed.js'

function MyWords({ w, toast }) {
  const seed = w.backend.seed
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const words = seed.words()
  const legacy = seed.legacy() && w.total > 0

  return (
    <div className="stack">
      <p className="hint">
        These <b>12 words</b> are the key to your acorns. With them you can restore your balance in any browser, or in another NUT-13 Cashu wallet
        (cashu.me, Minibits…). Write them down on paper. <b>Whoever has them has your sats.</b>
      </p>

      {!show ? (
        <button className="btn primary xl" onClick={() => setShow(true)}>
          Show my 12 words 👀
        </button>
      ) : (
        <>
          <ol className="words">
            {words.map((x, i) => (
              <li key={i}>
                <span>{i + 1}</span> {x}
              </li>
            ))}
          </ol>
          <div className="row">
            <CopyBtn text={words.join(' ')}>Copy 📋</CopyBtn>
            <button className="btn ghost" onClick={() => setShow(false)}>
              Hide
            </button>
          </div>
          {!seed.backedUp() ? (
            <button
              className="btn primary xl"
              onClick={() => {
                w.actions.markBackedUp()
                toast('🌱 Done! Keep them somewhere safe')
              }}
            >
              I wrote them down ✓
            </button>
          ) : (
            <p className="muted center">✓ You marked them as written down.</p>
          )}
        </>
      )}

      {legacy && (
        <div className="token-card">
          <b>You have balance from before the seed</b>
          <p className="hint">
            Those acorns can't be restored with the 12 words. Move them to the seed: they get swapped for new acorns at the mint (may cost a sat or two in
            fees).
          </p>
          {err && <p className="error">{err}</p>}
          <button
            className="btn primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              setErr('')
              try {
                const n = await w.actions.migrateToSeed()
                toast(`🌱 ${fmtSats(n)} sats now covered by the seed`)
              } catch (e) {
                setErr(errMsg(e))
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy ? 'Moving…' : 'Protect everything with the seed 🌱'}
          </button>
        </div>
      )}
    </div>
  )
}

function Restore({ w, toast }) {
  const [text, setText] = useState('')
  const known = [...new Set([...w.state.mints.map((m) => m.url), ...SUGGESTED_MINTS.map((m) => m.url)])]
  const [mints, setMints] = useState(known)
  const [picked, setPicked] = useState(() => new Set(w.state.mints.map((m) => m.url)))
  const [extra, setExtra] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [results, setResults] = useState(null)

  const words = normalizeWords(text)
  const count = words ? words.split(' ').length : 0
  const valid = count >= 12 && isValidMnemonic(words)
  const current = w.backend.seed.words().join(' ')
  const replacing = valid && words !== current

  const toggle = (u) =>
    setPicked((s) => {
      const n = new Set(s)
      n.has(u) ? n.delete(u) : n.add(u)
      return n
    })

  if (results) {
    const total = results.reduce((s, r) => s + (r.amount || 0), 0)
    return (
      <div className="stack">
        <p className="big-amount center">{total > 0 ? `+${fmtSats(total)} sats 🌱` : 'No balance found'}</p>
        <ul className="restore-results">
          {results.map((r) => (
            <li key={r.url}>
              <b>{shortUrl(r.url)}</b>
              <span className={r.error ? 'error' : ''}>{r.error ? `⚠️ ${r.error}` : r.amount ? `${fmtSats(r.amount)} sats` : 'nothing'}</span>
            </li>
          ))}
        </ul>
        <p className="hint">If you used other mints with this seed, add them and restore again: it's safe to repeat.</p>
        <button className="btn ghost" onClick={() => setResults(null)}>
          Restore on another mint
        </button>
      </div>
    )
  }

  return (
    <div className="stack">
      <p className="hint">Type your 12 words and pick which mints to search. The mint re-signs your acorns and you keep the unspent ones.</p>
      <textarea
        className="token-area"
        rows={3}
        placeholder="word1 word2 word3 …"
        spellCheck={false}
        autoCapitalize="none"
        autoComplete="off"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {count > 0 && !valid && <p className={count >= 12 ? 'error' : 'muted'}>{count >= 12 ? "Those words don't form a valid seed (check for typos)." : `${count} of 12 words`}</p>}
      {valid && <p className="muted">✓ Valid seed</p>}

      <h3>Search on</h3>
      <div className="seed-mints">
        {mints.map((u) => (
          <label key={u} className="seed-mint">
            <input type="checkbox" checked={picked.has(u)} onChange={() => toggle(u)} /> {shortUrl(u)}
          </label>
        ))}
      </div>
      <div className="row small">
        <input className="text-in grow" placeholder="Another mint: https://…" value={extra} onChange={(e) => setExtra(e.target.value)} />
        <button
          className="btn"
          disabled={!/^https?:\/\/.+\..+/.test(extra.trim())}
          onClick={() => {
            const u = extra.trim().replace(/\/+$/, '')
            setMints((m) => (m.includes(u) ? m : [...m, u]))
            setPicked((s) => new Set(s).add(u))
            setExtra('')
          }}
        >
          Add
        </button>
      </div>

      {replacing && w.total > 0 && (
        <div className="warn">
          This seed is different from your current one. Your current balance stays, but the new words don't cover it: afterwards you can move it to the new
          seed from “My words”. First, <b>write down your current words</b> just in case.
        </div>
      )}
      {progress && <p className="muted">{progress}</p>}
      <button
        className="btn primary xl"
        disabled={!valid || !picked.size || busy}
        onClick={async () => {
          setBusy(true)
          try {
            const r = await w.actions.restoreFromSeed(words, [...picked], (p) =>
              setProgress(p.phase === 'connect' ? `Connecting to ${shortUrl(p.url)}…` : `Searching ${shortUrl(p.url)} (keyset ${p.i + 1} of ${p.n})…`),
            )
            setResults(r)
            const total = r.reduce((s, x) => s + (x.amount || 0), 0)
            if (total) toast(`🌱 Restored ${fmtSats(total)} sats`)
          } finally {
            setBusy(false)
            setProgress('')
          }
        }}
      >
        {busy ? 'Restoring…' : 'Restore 🌱'}
      </button>
    </div>
  )
}

export default function SeedSheet({ w, onClose, toast }) {
  const [tab, setTab] = useState('words')
  if (!w.backend.seed)
    return (
      <Sheet title="Seed" emoji="🌱" onClose={onClose}>
        <p className="hint">Demo mode has no seed: the sats are toys. Switch to “Real mints” to get your 12 words.</p>
      </Sheet>
    )
  return (
    <Sheet title="Seed" emoji="🌱" onClose={onClose}>
      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { value: 'words', label: '🔑 My words' },
          { value: 'restore', label: '🌱 Restore' },
        ]}
      />
      {tab === 'words' ? <MyWords w={w} toast={toast} /> : <Restore w={w} toast={toast} />}
    </Sheet>
  )
}
