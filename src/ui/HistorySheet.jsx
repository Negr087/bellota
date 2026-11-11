import { useState } from 'react'
import { CopyBtn, Sheet, errMsg, fmtSats, shortUrl } from './kit.jsx'

const META = {
  'ln-in': { icon: '⚡', label: 'Received via Lightning', sign: '+' },
  'ecash-in': { icon: '🌰', label: 'Claimed ecash', sign: '+' },
  restore: { icon: '🌱', label: 'Restored from seed', sign: '+' },
  'ecash-out': { icon: '🎁', label: 'Sent ecash', sign: '−' },
  'ln-out': { icon: '⚡', label: 'Paid via Lightning', sign: '−' },
}

function when(ts) {
  const d = new Date(ts)
  const diff = (Date.now() - ts) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
}

function SentToken({ w, h, toast }) {
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  if (h.reclaimed) return <span className="pill">reclaimed</span>
  return (
    <div className="row small">
      <CopyBtn text={h.token} className="btn tiny">
        Copy token
      </CopyBtn>
      <button
        className="btn tiny ghost"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try {
            const spent = await w.actions.isTokenSpent(h.token)
            setStatus(spent ? 'claimed' : 'unclaimed')
          } catch (e) {
            setStatus(errMsg(e))
          } finally {
            setBusy(false)
          }
        }}
      >
        Claimed yet?
      </button>
      {status === 'unclaimed' && (
        <button
          className="btn tiny primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              await w.actions.reclaim(h)
              toast('Back in the jar 🌰')
            } catch (e) {
              setStatus(errMsg(e))
            } finally {
              setBusy(false)
            }
          }}
        >
          Reclaim
        </button>
      )}
      {status && <span className="pill">{status}</span>}
    </div>
  )
}

export default function HistorySheet({ w, onClose, toast }) {
  const list = w.state.history
  return (
    <Sheet title="History" emoji="📜" onClose={onClose}>
      {list.length === 0 ? (
        <div className="empty">
          <div className="empty-art">🫙</div>
          <p>Nothing here yet. Receive your first acorns!</p>
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
                    {h.to ? ` to ${h.to}` : ''}
                  </b>
                  <small>
                    {when(h.ts)} · {shortUrl(h.mint)}
                    {h.fee ? ` · fee ${fmtSats(h.fee)}` : ''}
                    {h.pending ? ' · ⏳ awaiting confirmation' : ''}
                    {h.failed ? ' · ❌ failed, acorns returned' : ''}
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
