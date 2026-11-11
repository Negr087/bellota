// Figures out what came out of a QR code or the clipboard.
//   { kind: 'token', value }    Cashu token (cashuA…, cashuB…, cashuDemo…)
//   { kind: 'invoice', value }  bolt11 Lightning invoice
//   { kind: 'address', value }  Lightning Address (user@domain) or LNURL-pay (lnurl1…)
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
  if (/^cashu[A-Za-z]/.test(s)) return { kind: 'token', value: s }
  // (deliberately loose: the mint does the real validation, and demo invoices aren't bech32)
  if (/^ln(bc|tb|bcrt|tbs)[0-9a-z]+$/i.test(s)) return { kind: 'invoice', value: s.toLowerCase() }
  return { kind: 'unknown', value: s }
}
