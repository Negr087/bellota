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
        Estas <b>12 palabras</b> son la llave de tus bellotas. Con ellas recuperás tu saldo en cualquier navegador, o en otra wallet Cashu compatible con NUT-13
        (cashu.me, Minibits…). Anotalas en papel. <b>Quien las tenga, tiene tus sats.</b>
      </p>

      {!show ? (
        <button className="btn primary xl" onClick={() => setShow(true)}>
          Mostrar mis 12 palabras 👀
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
            <CopyBtn text={words.join(' ')}>Copiar 📋</CopyBtn>
            <button className="btn ghost" onClick={() => setShow(false)}>
              Ocultar
            </button>
          </div>
          {!seed.backedUp() ? (
            <button
              className="btn primary xl"
              onClick={() => {
                w.actions.markBackedUp()
                toast('🌱 ¡Listo! Guardalas en un lugar seguro')
              }}
            >
              Ya las anoté ✓
            </button>
          ) : (
            <p className="muted center">✓ Marcaste que ya las anotaste.</p>
          )}
        </>
      )}

      {legacy && (
        <div className="token-card">
          <b>Tenés saldo de antes de la semilla</b>
          <p className="hint">
            Esas bellotas no se recuperan con las 12 palabras. Pasalas a la semilla: se cambian por bellotas nuevas en el mint (puede costar 1 o 2 sats de
            comisión).
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
                toast(`🌱 ${fmtSats(n)} sats protegidos por la semilla`)
              } catch (e) {
                setErr(errMsg(e))
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy ? 'Pasando…' : 'Proteger todo con la semilla 🌱'}
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
        <p className="big-amount center">{total > 0 ? `+${fmtSats(total)} sats 🌱` : 'No encontré saldo'}</p>
        <ul className="restore-results">
          {results.map((r) => (
            <li key={r.url}>
              <b>{shortUrl(r.url)}</b>
              <span className={r.error ? 'error' : ''}>{r.error ? `⚠️ ${r.error}` : r.amount ? `${fmtSats(r.amount)} sats` : 'nada'}</span>
            </li>
          ))}
        </ul>
        <p className="hint">Si usaste otros mints con esta semilla, agregalos y volvé a recuperar: es seguro repetirlo.</p>
        <button className="btn ghost" onClick={() => setResults(null)}>
          Recuperar en otro mint
        </button>
      </div>
    )
  }

  return (
    <div className="stack">
      <p className="hint">Escribí tus 12 palabras y elegí en qué mints buscar. El mint vuelve a firmar tus bellotas y te quedás con las que no se gastaron.</p>
      <textarea
        className="token-area"
        rows={3}
        placeholder="palabra1 palabra2 palabra3 …"
        spellCheck={false}
        autoCapitalize="none"
        autoComplete="off"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {count > 0 && !valid && <p className={count >= 12 ? 'error' : 'muted'}>{count >= 12 ? 'Esas palabras no forman una semilla válida (revisá si hay alguna mal escrita).' : `${count} de 12 palabras`}</p>}
      {valid && <p className="muted">✓ Semilla válida</p>}

      <h3>Buscar en</h3>
      <div className="mint-picks">
        {mints.map((u) => (
          <label key={u} className="mint-pick">
            <input type="checkbox" checked={picked.has(u)} onChange={() => toggle(u)} /> {shortUrl(u)}
          </label>
        ))}
      </div>
      <div className="row small">
        <input className="text-in grow" placeholder="Otro mint: https://…" value={extra} onChange={(e) => setExtra(e.target.value)} />
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
          Agregar
        </button>
      </div>

      {replacing && w.total > 0 && (
        <div className="warn">
          Esta semilla es distinta a la tuya actual. Tu saldo de ahora se queda, pero no lo cubren las palabras nuevas: después podés pasarlo a la semilla nueva
          desde “Mis palabras”. Antes, <b>anotá tus palabras actuales</b> por las dudas.
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
              setProgress(p.phase === 'connect' ? `Conectando con ${shortUrl(p.url)}…` : `Buscando en ${shortUrl(p.url)} (keyset ${p.i + 1} de ${p.n})…`),
            )
            setResults(r)
            const total = r.reduce((s, x) => s + (x.amount || 0), 0)
            if (total) toast(`🌱 Recuperaste ${fmtSats(total)} sats`)
          } finally {
            setBusy(false)
            setProgress('')
          }
        }}
      >
        {busy ? 'Recuperando…' : 'Recuperar 🌱'}
      </button>
    </div>
  )
}

export default function SeedSheet({ w, onClose, toast }) {
  const [tab, setTab] = useState('words')
  if (!w.backend.seed)
    return (
      <Sheet title="Semilla" emoji="🌱" onClose={onClose}>
        <p className="hint">En modo demo no hay semilla: los sats son de juguete. Pasate a “Mints reales” para tener tus 12 palabras.</p>
      </Sheet>
    )
  return (
    <Sheet title="Semilla" emoji="🌱" onClose={onClose}>
      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { value: 'words', label: '🔑 Mis palabras' },
          { value: 'restore', label: '🌱 Recuperar' },
        ]}
      />
      {tab === 'words' ? <MyWords w={w} toast={toast} /> : <Restore w={w} toast={toast} />}
    </Sheet>
  )
}
