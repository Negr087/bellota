// Figures out what came out of a QR code or the clipboard.
//   { kind: 'token', value }    Cashu token (cashuA…, cashuB…, cashuDemo…)
//   { kind: 'invoice', value }  bolt11 Lightning invoice
//   { kind: 'address', value }  Lightning Address (user@domain) or LNURL-pay (lnurl1…)
//   { kind: 'request', value }  Cashu payment request (creqA…, CREQB1…, NUT-18)
//   { kind: 'unknown', value }
// A token hidden in an emoji (🥜 + invisible selectors) is unwrapped first: { kind: 'token', value, emoji: true }.
import { isLightningAddress, isLnurl } from './lnurl.js'
import { decodeEmoji, hasHiddenData } from './emoji.js'

export function classify(raw) {
  if (hasHiddenData(raw)) {
    const hidden = decodeEmoji(raw)
    if (hidden && !hasHiddenData(hidden)) return { ...classify(hidden), emoji: true }
  }
  let s = String(raw || '').trim()
  // URI schemes: cashu:, lightning:, web+cashu:
  s = s.replace(/^(web\+)?cashu:(\/\/)?/i, '').replace(/^lightning:(\/\/)?/i, '')

  // Unified BIP21: bitcoin:bc1…?amount=…&lightning=lnbc…
  if (/^bitcoin:/i.test(s)) {
    const q = s.split('?')[1] || ''
    const ln = new URLSearchParams(q).get('lightning')
    if (ln) return { kind: 'invoice', value: ln.trim().toLowerCase() }
    return { kind: 'unknown', value: s }
  }

  if (isLnurl(s)) return { kind: 'address', value: s.toLowerCase() }
  if (isLightningAddress(s)) return { kind: 'address', value: s.toLowerCase() }
  if (/^cashu[A-Za-z]/.test(s)) return { kind: 'token', value: s.replace(/\s+/g, '') }
  if (/^creqa[A-Za-z0-9_-]+=*$/i.test(s)) return { kind: 'request', value: s }
  if (/^creqb1[0-9a-z]+$/i.test(s)) return { kind: 'request', value: s }
  // (deliberately loose: the mint does the real validation, and demo invoices aren't bech32)
  if (/^ln(bc|tb|bcrt|tbs)[0-9a-z]+$/i.test(s)) return { kind: 'invoice', value: s.toLowerCase() }
  return findInside(s)
}

// Chat messages (bitchat, Signal, Nostr…) often wrap the token in other text:
// "here you go 🌰 cashuB… thanks!". Pull out the first thing we recognize.
function findInside(s) {
  const m =
    s.match(/\bcashu[AB][A-Za-z0-9_\-+/=]{20,}/) ||
    s.match(/\bcreqA[A-Za-z0-9_\-+/=]{10,}/) ||
    s.match(/\bCREQB1[0-9A-Z]{10,}/i) ||
    s.match(/\bln(bc|tb|bcrt)[0-9][0-9a-z]{20,}/i)
  if (!m) return { kind: 'unknown', value: s }
  const r = classify(m[0])
  return r.kind === 'unknown' ? { kind: 'unknown', value: s } : { ...r, embedded: true }
}
