import { useState } from 'react'
import { CopyBtn, QR, fmtSats } from './kit.jsx'
import { CARRIERS, encodeEmoji } from '../lib/emoji.js'
import { giftLink } from '../lib/gift.js'

const FORMATS = [
  { value: 'text', label: '🔤 Token' },
  { value: 'emoji', label: '🥜 Emoji' },
  { value: 'gift', label: '🎁 Gift link' },
]

function GiftShare({ token, amount }) {
  const link = giftLink(token)
  const text = `🎁 I sent you ${fmtSats(amount)} sats! Open your gift: ${link}`
  return (
    <>
      <QR value={link} label="Gift link" />
      <p className="hint center">
        A link anyone can open, even without a wallet: they see a gift box, tap it, and the acorns drop into their own jar. Scan the QR with a phone camera
        or send the link in any chat. The token lives after the <code>#</code>, so it never reaches a server.
      </p>
      <div className="row">
        <CopyBtn text={link} className="btn primary">
          Copy link 🎁
        </CopyBtn>
        {navigator.share && (
          <button className="btn ghost" onClick={() => navigator.share({ title: 'A gift for you', text }).catch(() => {})}>
            Share
          </button>
        )}
      </div>
      <code className="mono-clip">{link}</code>
    </>
  )
}

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

export default function ShareToken({ token, amount }) {
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
      {fmt === 'gift' && <GiftShare token={token} amount={amount} />}
      <p className="muted center small-print">Hidden, not encrypted: whoever gets it can claim it, just like the plain token.</p>
    </div>
  )
}
