// Entiende lo que sale de un QR o del portapapeles y dice qué es.
//   { kind: 'token', value }    token Cashu (cashuA…, cashuB…, cashuDemo…)
//   { kind: 'invoice', value }  invoice Lightning bolt11
//   { kind: 'unknown', value }
export function classify(raw) {
  let s = String(raw || '').trim()
  // Esquemas URI: cashu:, lightning:, web+cashu:
  s = s.replace(/^(web\+)?cashu:(\/\/)?/i, '').replace(/^lightning:(\/\/)?/i, '')

  // BIP21 unificado: bitcoin:bc1…?amount=…&lightning=lnbc…
  if (/^bitcoin:/i.test(s)) {
    const q = s.split('?')[1] || ''
    const ln = new URLSearchParams(q).get('lightning')
    if (ln) return { kind: 'invoice', value: ln.trim().toLowerCase() }
    return { kind: 'unknown', value: s }
  }

  if (/^cashu[A-Za-z]/.test(s)) return { kind: 'token', value: s }
  // (laxo a propósito: el mint valida la invoice de verdad, y las de la demo no son bech32)
  if (/^ln(bc|tb|bcrt|tbs)[0-9a-z]+$/i.test(s)) return { kind: 'invoice', value: s.toLowerCase() }
  return { kind: 'unknown', value: s }
}
