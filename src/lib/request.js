// 📝 Cashu payment requests (NUT-18): "pay me X sats on one of these mints".
// Pure encoding/decoding, no network, so it works the same in demo mode and offline.
import { PaymentRequest, PaymentRequestTransportType } from '@cashu/cashu-ts'
import { amountOf } from './cashu.js'

const rid = () => [...crypto.getRandomValues(new Uint8Array(4))].map((b) => b.toString(16).padStart(2, '0')).join('')

// No transport: the payer hands the token back over any channel (chat, bitchat, QR…).
export function makeRequest({ amount, description, mints }) {
  const req = new PaymentRequest([], rid(), amount || undefined, 'sat', mints, description || undefined, true)
  return req.toEncodedCreqA()
}

export function readRequest(encoded) {
  let r
  try {
    r = PaymentRequest.fromEncodedRequest(encoded.trim())
  } catch {
    throw new Error("That isn't a valid Cashu payment request.")
  }
  const amount = r.amount != null ? amountOf(r.amount) : null
  return {
    raw: r,
    id: r.id,
    amount,
    unit: r.unit || 'sat',
    description: r.description,
    mints: (r.mints || []).map((u) => u.replace(/\/+$/, '')),
    strict: r.isMintListStrict !== false, // no list → any mint
    lock: r.nut10 ? r.toP2PKOptions() : undefined,
    lockKind: r.nut10?.kind,
    post: r.getTransport(PaymentRequestTransportType.POST)?.target,
    nostr: !!r.getTransport(PaymentRequestTransportType.NOSTR),
  }
}

// Delivers the payment over the request's HTTP transport. Returns true if the payee accepted it.
export async function postPayment(req, mint, proofs, memo) {
  if (!req.post) return false
  const body = req.raw.encodePayload(mint, proofs, memo ? { memo } : undefined)
  const res = await fetch(req.post, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
  return res.ok
}
