import { useState } from 'react'
import { CopyBtn, Sheet, errMsg, fmtSats, shortUrl } from './kit.jsx'

const META = {
  'ln-in': { icon: '⚡', label: 'Recibiste por Lightning', sign: '+' },
  'ecash-in': { icon: '🌰', label: 'Cobraste ecash', sign: '+' },
  restore: { icon: '🌱', label: 'Recuperado con la semilla', sign: '+' },
  'ecash-out': { icon: '🎁', label: 'Enviaste ecash', sign: '−' },
  'ln-out': { icon: '⚡', label: 'Pagaste por Lightning', sign: '−' },
}

function when(ts) {
  const d = new Date(ts)
  const diff = (Date.now() - ts) / 1000
  if (diff < 60) return 'recién'
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

function SentToken({ w, h, toast }) {
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  if (h.reclaimed) return <span className="pill">recuperado</span>
  return (
    <div className="row small">
      <CopyBtn text={h.token} className="btn tiny">
        Copiar token
      </CopyBtn>
      <button
        className="btn tiny ghost"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try {
            const spent = await w.actions.isTokenSpent(h.token)
            setStatus(spent ? 'cobrado' : 'sin cobrar')
          } catch (e) {
            setStatus(errMsg(e))
          } finally {
            setBusy(false)
          }
        }}
      >
        ¿Lo cobraron?
      </button>
      {status === 'sin cobrar' && (
        <button
          className="btn tiny primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              await w.actions.reclaim(h)
              toast('Volvieron al frasco 🌰')
            } catch (e) {
              setStatus(errMsg(e))
            } finally {
              setBusy(false)
            }
          }}
        >
          Recuperar
        </button>
      )}
      {status && <span className="pill">{status}</span>}
    </div>
  )
}

export default function HistorySheet({ w, onClose, toast }) {
  const list = w.state.history
  return (
    <Sheet title="Historial" emoji="📜" onClose={onClose}>
      {list.length === 0 ? (
        <div className="empty">
          <div className="empty-art">🫙</div>
          <p>Todavía no pasó nada por acá. ¡Recibí tus primeras bellotas!</p>
        </div>
      ) : (
        <ul className="history">
          {list.map((h) => {
            const m = META[h.type]
            return (
              <li key={h.id} className={m.sign === '+' ? 'in' : 'out'}>
                <span className="h-icon">{m.icon}</span>
                <div className="h-main">
                  <b>
                    {m.label}
                    {h.to ? ` a ${h.to}` : ''}
                  </b>
                  <small>
                    {when(h.ts)} · {shortUrl(h.mint)}
                    {h.fee ? ` · comisión ${fmtSats(h.fee)}` : ''}
                    {h.pending ? ' · ⏳ esperando confirmación' : ''}
                    {h.failed ? ' · ❌ falló, bellotas devueltas' : ''}
                  </small>
                  {h.memo && <small className="memo">“{h.memo}”</small>}
                  {h.type === 'ecash-out' && h.token && <SentToken w={w} h={h} toast={toast} />}
                </div>
                <span className="h-amt">
                  {m.sign}
                  {fmtSats(h.amount)}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Sheet>
  )
}
