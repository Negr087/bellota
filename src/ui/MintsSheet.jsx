import { useState } from 'react'
import { CopyBtn, Sheet, errMsg, fmtSats, shortUrl } from './kit.jsx'
import { SUGGESTED_MINTS, FORCE_DEMO } from '../lib/useWallet.js'
import { sumOf } from '../lib/cashu.js'

export default function MintsSheet({ w, onClose, toast }) {
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
      toast('Mint agregado 🏦')
    } catch (e) {
      setErr(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet title="Mints y ajustes" emoji="🏦" onClose={onClose}>
      <div className="stack">
        <p className="hint">
          Un <b>mint</b> es quien emite el ecash: guarda los sats y firma tus bellotas. Elegí en cuál trabajar; cada uno es un frasco distinto.
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
                    aria-label="Quitar mint"
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
              <input className="text-in grow" placeholder="https://mint.ejemplo.com" value={url} onChange={(e) => setUrl(e.target.value)} />
              <button className="btn primary" disabled={!/^https?:\/\/\S+$/.test(url.trim()) || busy} onClick={() => add(url)}>
                {busy ? '…' : 'Agregar'}
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

        <h3>Modo</h3>
        {FORCE_DEMO ? (
          <p className="hint">Esta es la versión demo: sin internet, con sats de juguete. Descargá el proyecto para usar mints reales.</p>
        ) : (
          <div className="seg">
            <button className={w.mode === 'real' ? 'on' : ''} onClick={() => w.setMode('real')}>
              Mints reales
            </button>
            <button className={w.mode === 'demo' ? 'on' : ''} onClick={() => w.setMode('demo')}>
              Demo (de juguete)
            </button>
          </div>
        )}

        <h3>Respaldo</h3>
        <p className="hint">
          El ecash vive <b>solo en este navegador</b>. Si borrás los datos, se pierde. Exportá un token por mint y guardalo en un lugar seguro: con eso recuperás todo.
        </p>
        {!backup ? (
          <button className="btn ghost" onClick={() => setBackup(w.actions.exportBackup())}>
            Exportar respaldo 🔐
          </button>
        ) : backup.length === 0 ? (
          <p className="muted">No hay saldo para respaldar.</p>
        ) : (
          backup.map((b) => (
            <div key={b.mint} className="token-card">
              <b>
                {fmtSats(b.amount)} sats · {shortUrl(b.mint)}
              </b>
              <code className="mono-clip">{b.token}</code>
              <CopyBtn text={b.token}>Copiar</CopyBtn>
            </div>
          ))
        )}
      </div>
    </Sheet>
  )
}
