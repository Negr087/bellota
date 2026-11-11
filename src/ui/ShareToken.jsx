import { useEffect, useState } from 'react'
import { CopyBtn, QR, fmtSats } from './kit.jsx'
import { CARRIERS, encodeEmoji } from '../lib/emoji.js'

const FORMATS = [
  { value: 'text', label: '🔤 Token' },
  { value: 'emoji', label: '🥜 Emoji' },
  { value: 'gif', label: '🎞️ GIF' },
]

function EmojiShare({ token }) {
  const [carrier, setCarrier] = useState(CARRIERS[0])
  const emoji = encodeEmoji(token, carrier)
  return (
    <>
      <div className="emoji-token" aria-label={`Token hidden in ${carrier}`}>
        {emoji}
      </div>
      <div className="row emoji-pick" role="radiogroup" aria-label="Emoji">
        {CARRIERS.map((c) => (
          <button key={c} role="radio" aria-checked={c === carrier} className={`chip${c === carrier ? ' on' : ''}`} onClick={() => setCarrier(c)}>
            {c}
          </button>
        ))}
      </div>
      <p className="hint center">
        The whole token is hidden inside this emoji as invisible characters. Paste it in any chat; the other person copies it into Bellota or cashu.me to claim
        it. {carrier === '🥜' ? '🥜 works with the most wallets.' : 'Some wallets only recognize 🥜.'}
      </p>
      <div className="row">
        <CopyBtn text={emoji} className="btn primary">
          Copy {carrier}
        </CopyBtn>
        {navigator.share && (
          <button className="btn ghost" onClick={() => navigator.share({ text: emoji }).catch(() => {})}>
            Share
          </button>
        )}
      </div>
    </>
  )
}

function GifShare({ token, amount, memo }) {
  const [gif, setGif] = useState(null) // { url, file }
  const [err, setErr] = useState('')
  useEffect(() => {
    let url
    let alive = true
    ;(async () => {
      try {
        const { tokenToGif, qrFits } = await import('../lib/gif.js')
        if (!qrFits(token)) throw new Error('This token is too big for a QR code. Send it as text or emoji instead.')
        const blob = await tokenToGif(token, { amount, memo })
        if (!alive) return
        url = URL.createObjectURL(blob)
        setGif({ url, file: new File([blob], `bellota-${amount}-sats.gif`, { type: 'image/gif' }) })
      } catch (e) {
        if (alive) setErr(e?.message || String(e))
      }
    })()
    return () => {
      alive = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [token, amount, memo])

  if (err) return <p className="error">{err}</p>
  if (!gif) return <div className="gif-token loading">Drawing your GIF…</div>
  const canShareFile = navigator.canShare?.({ files: [gif.file] })
  return (
    <>
      <a href={gif.url} target="_blank" rel="noreferrer" title="Open full size">
        <img className="gif-token" src={gif.url} alt={`Animated GIF with a QR code for ${amount} sats`} />
      </a>
      <p className="hint center">
        The QR code is readable by any Cashu wallet, even after chat apps recompress the GIF. Bellota also reads the exact token hidden inside the file.
      </p>
      <div className="row">
        {canShareFile && (
          <button className="btn primary" onClick={() => navigator.share({ files: [gif.file] }).catch(() => {})}>
            Share GIF
          </button>
        )}
        <a className={`btn${canShareFile ? ' ghost' : ' primary'}`} href={gif.url} download={gif.file.name}>
          Download GIF
        </a>
      </div>
    </>
  )
}

export default function ShareToken({ token, amount, memo }) {
  const [fmt, setFmt] = useState('text')
  return (
    <div className="stack center">
      <div className="seg share-fmt" role="tablist" aria-label="Share as">
        {FORMATS.map((f) => (
          <button key={f.value} role="tab" aria-selected={fmt === f.value} className={fmt === f.value ? 'on' : ''} onClick={() => setFmt(f.value)}>
            {f.label}
          </button>
        ))}
      </div>
      <p className="big-amount">{fmtSats(amount)} sats</p>
      {fmt === 'text' && (
        <>
          <QR value={token} label="Cashu token" />
          <p className="hint center">
            Send this token to anyone (chat, email, Nostr, a scrap of paper…). They can claim it with any Cashu wallet. If nobody claims it, you can reclaim it
            from your history.
          </p>
          <div className="row">
            <CopyBtn text={token} className="btn primary">
              Copy token 📋
            </CopyBtn>
            {navigator.share && (
              <button className="btn ghost" onClick={() => navigator.share({ text: token }).catch(() => {})}>
                Share
              </button>
            )}
          </div>
          <code className="mono-clip">{token}</code>
        </>
      )}
      {fmt === 'emoji' && <EmojiShare token={token} />}
      {fmt === 'gif' && <GifShare token={token} amount={amount} memo={memo} />}
      <p className="muted center small-print">Hidden, not encrypted: whoever gets it can claim it, just like the plain token.</p>
    </div>
  )
}
