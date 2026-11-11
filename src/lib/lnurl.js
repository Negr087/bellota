// Lightning Address (LUD-16) and LNURL-pay (LUD-01/06/12).
//   user@domain  →  https://domain/.well-known/lnurlp/user
//   lnurl1…      →  bech32-encoded URL
// The server returns limits and a callback; the callback returns the invoice we pay through the mint.

const ADDRESS = /^[a-z0-9._+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/i

export const isLightningAddress = (s) => ADDRESS.test(String(s || '').trim())
export const isLnurl = (s) => /^lnurl1[02-9ac-hj-np-z]+$/i.test(String(s || '').trim())

// --- bech32 (BIP-173), with no length limit because LNURLs exceed 90 characters ---
const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'
function polymod(values) {
  const G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]
  let chk = 1
  for (const v of values) {
    const top = chk >> 25
    chk = ((chk & 0x1ffffff) << 5) ^ v
    for (let i = 0; i < 5; i++) if ((top >> i) & 1) chk ^= G[i]
  }
  return chk
}
function bech32ToUrl(str) {
  const s = str.toLowerCase()
  const pos = s.lastIndexOf('1')
  const hrp = s.slice(0, pos)
  const data = [...s.slice(pos + 1)].map((c) => CHARSET.indexOf(c))
  if (data.some((d) => d < 0) || data.length < 6) throw new Error('Invalid LNURL')
  const expanded = [...[...hrp].map((c) => c.charCodeAt(0) >> 5), 0, ...[...hrp].map((c) => c.charCodeAt(0) & 31)]
  if (polymod([...expanded, ...data]) !== 1) throw new Error('Invalid LNURL (checksum)')
  // 5 bits → 8 bits
  let acc = 0
  let bits = 0
  const bytes = []
  for (const v of data.slice(0, -6)) {
    acc = (acc << 5) | v
    bits += 5
    while (bits >= 8) {
      bits -= 8
      bytes.push((acc >> bits) & 255)
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes))
}

function endpoint(target) {
  const t = target.trim()
  if (isLnurl(t)) return bech32ToUrl(t)
  if (isLightningAddress(t)) {
    const [user, domain] = t.toLowerCase().split('@')
    // LUD-16: .onion domains use http
    return `${domain.endsWith('.onion') ? 'http' : 'https'}://${domain}/.well-known/lnurlp/${user}`
  }
  throw new Error("That's not a Lightning Address (user@domain)")
}

async function getJson(url) {
  let res
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' } })
  } catch {
    throw new Error(`Couldn't reach ${new URL(url).host}. Is the address spelled correctly?`)
  }
  let body
  try {
    body = await res.json()
  } catch {
    throw new Error(res.status === 404 ? "That Lightning Address doesn't exist" : `Invalid response from ${new URL(url).host}`)
  }
  if (body?.status === 'ERROR') throw new Error(body.reason || 'The server returned an error')
  if (!res.ok) throw new Error(res.status === 404 ? "That Lightning Address doesn't exist" : `Error ${res.status} from ${new URL(url).host}`)
  return body
}

// Step 1: what the recipient accepts.
export async function resolvePayTarget(target) {
  const url = endpoint(target)
  const p = await getJson(url)
  if (p.tag !== 'payRequest' || !p.callback) throw new Error("That address doesn't accept payments (not LNURL-pay)")
  let desc = ''
  try {
    desc = JSON.parse(p.metadata).find((m) => m[0] === 'text/plain')?.[1] || ''
  } catch {
    /* odd metadata: not a big deal */
  }
  return {
    target: target.trim(),
    domain: new URL(p.callback).host,
    callback: p.callback,
    min: Math.ceil((p.minSendable || 1000) / 1000), // msat → sat
    max: Math.floor((p.maxSendable || 1000) / 1000),
    commentAllowed: Number(p.commentAllowed) || 0,
    desc,
  }
}

// Step 2: request the invoice for `sats`.
export async function requestInvoice(info, sats, comment) {
  if (sats < info.min || sats > info.max) throw new Error(`This address accepts between ${info.min} and ${info.max} sats`)
  const u = new URL(info.callback)
  u.searchParams.set('amount', String(sats * 1000))
  if (comment && info.commentAllowed) u.searchParams.set('comment', comment.slice(0, info.commentAllowed))
  const r = await getJson(u.toString())
  if (!r.pr) throw new Error("The server didn't return an invoice")
  return r.pr
}
