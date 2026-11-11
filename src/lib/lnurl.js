// Lightning Address (LUD-16) y LNURL-pay (LUD-01/06/12).
//   usuario@dominio  →  https://dominio/.well-known/lnurlp/usuario
//   lnurl1…          →  URL codificada en bech32
// El servidor devuelve montos y un callback; el callback devuelve la invoice que pagamos con el mint.

const ADDRESS = /^[a-z0-9._+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/i

export const isLightningAddress = (s) => ADDRESS.test(String(s || '').trim())
export const isLnurl = (s) => /^lnurl1[02-9ac-hj-np-z]+$/i.test(String(s || '').trim())

// --- bech32 (BIP-173), sin límite de largo porque los LNURL superan los 90 caracteres ---
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
  if (data.some((d) => d < 0) || data.length < 6) throw new Error('LNURL inválido')
  const expanded = [...[...hrp].map((c) => c.charCodeAt(0) >> 5), 0, ...[...hrp].map((c) => c.charCodeAt(0) & 31)]
  if (polymod([...expanded, ...data]) !== 1) throw new Error('LNURL inválido (checksum)')
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
    // LUD-16: dominios .onion van por http
    return `${domain.endsWith('.onion') ? 'http' : 'https'}://${domain}/.well-known/lnurlp/${user}`
  }
  throw new Error('Eso no es una Lightning Address (usuario@dominio)')
}

async function getJson(url) {
  let res
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' } })
  } catch {
    throw new Error(`No pude conectar con ${new URL(url).host}. ¿Está bien escrita la dirección?`)
  }
  let body
  try {
    body = await res.json()
  } catch {
    throw new Error(res.status === 404 ? 'Esa Lightning Address no existe' : `Respuesta inválida de ${new URL(url).host}`)
  }
  if (body?.status === 'ERROR') throw new Error(body.reason || 'El servidor devolvió un error')
  if (!res.ok) throw new Error(res.status === 404 ? 'Esa Lightning Address no existe' : `Error ${res.status} de ${new URL(url).host}`)
  return body
}

// Paso 1: qué acepta el destinatario.
export async function resolvePayTarget(target) {
  const url = endpoint(target)
  const p = await getJson(url)
  if (p.tag !== 'payRequest' || !p.callback) throw new Error('Esa dirección no acepta pagos (no es LNURL-pay)')
  let desc = ''
  try {
    desc = JSON.parse(p.metadata).find((m) => m[0] === 'text/plain')?.[1] || ''
  } catch {
    /* metadata rara: no es grave */
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

// Paso 2: pedir la invoice por `sats`.
export async function requestInvoice(info, sats, comment) {
  if (sats < info.min || sats > info.max) throw new Error(`Esta dirección acepta entre ${info.min} y ${info.max} sats`)
  const u = new URL(info.callback)
  u.searchParams.set('amount', String(sats * 1000))
  if (comment && info.commentAllowed) u.searchParams.set('comment', comment.slice(0, info.commentAllowed))
  const r = await getJson(u.toString())
  if (!r.pr) throw new Error('El servidor no devolvió una invoice')
  return r.pr
}
