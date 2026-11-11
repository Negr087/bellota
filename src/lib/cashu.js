// Backend real: habla con mints Cashu usando @cashu/cashu-ts.
// La UI solo conoce esta interfaz; el modo demo (demo.js) implementa la misma.
import {
  Wallet,
  MintQuoteState,
  getEncodedToken,
  getTokenMetadata,
  serializeProofs,
  deserializeProofs,
} from '@cashu/cashu-ts'

export const amountOf = (x) =>
  typeof x === 'object' && x !== null && 'toNumber' in x ? x.toNumber() : Number(x)

export const sumOf = (proofs) => proofs.reduce((s, p) => s + amountOf(p.amount), 0)

const wallets = new Map()

async function getWallet(mintUrl) {
  if (!wallets.has(mintUrl)) {
    const w = new Wallet(mintUrl) // unidad: sat
    wallets.set(
      mintUrl,
      w.loadMint().then(() => w),
    )
  }
  try {
    return await wallets.get(mintUrl)
  } catch (e) {
    wallets.delete(mintUrl)
    throw new Error(`No pude conectar con el mint (${mintUrl}). ${e?.message ?? ''}`)
  }
}

export const realBackend = {
  isDemo: false,

  serialize: (proofs) => JSON.stringify(serializeProofs(proofs)),
  deserialize: (str) => deserializeProofs(str || '[]'),

  async mintInfo(mintUrl) {
    const w = await getWallet(mintUrl)
    const info = w.getMintInfo()
    return { name: info.name || new URL(mintUrl).host, description: info.description }
  },

  // ⚡ → 🌰  Recibir por Lightning (NUT-04)
  async createInvoice(mintUrl, amount) {
    const w = await getWallet(mintUrl)
    const q = await w.createMintQuoteBolt11(amount, 'Bellota 🌰')
    return { quote: q.quote, request: q.request, amount, expiry: q.expiry }
  },

  // Devuelve 'UNPAID' | 'PAID' | 'ISSUED'
  async checkInvoice(mintUrl, quote) {
    const w = await getWallet(mintUrl)
    const q = await w.checkMintQuoteBolt11(quote)
    return q.state
  },

  async claimInvoice(mintUrl, amount, quote) {
    const w = await getWallet(mintUrl)
    return w.mintProofsBolt11(amount, quote)
  },

  // 🌰 Recibir ecash (token cashuA/cashuB)
  tokenInfo(token) {
    const meta = getTokenMetadata(token.trim())
    return { mint: meta.mint, amount: amountOf(meta.amount), unit: meta.unit, memo: meta.memo }
  },

  async receiveToken(token) {
    const clean = token.trim()
    const meta = getTokenMetadata(clean)
    if (meta.unit && meta.unit !== 'sat') throw new Error(`Por ahora solo acepto sats (el token es en ${meta.unit}).`)
    const w = await getWallet(meta.mint)
    const proofs = await w.receive(clean)
    return { mint: meta.mint, proofs }
  },

  // 🌰 → token  Enviar ecash
  async sendEcash(mintUrl, amount, proofs, memo) {
    const w = await getWallet(mintUrl)
    const { keep, send } = await w.send(amount, proofs, { includeFees: true })
    const token = getEncodedToken({ mint: mintUrl, proofs: send, unit: 'sat', ...(memo ? { memo } : {}) })
    return { keep, send, token }
  },

  // 🌰 → ⚡  Pagar invoice (NUT-05)
  async meltQuote(mintUrl, invoice) {
    const w = await getWallet(mintUrl)
    const q = await w.createMeltQuoteBolt11(invoice.trim().replace(/^lightning:/i, ''))
    return { raw: q, amount: amountOf(q.amount), fee: amountOf(q.fee_reserve) }
  },

  // `onReserve({ keep, send })` se llama apenas el swap separa las proofs, ANTES del melt:
  // el swap invalida las proofs viejas, así que hay que persistir keep/send ya mismo
  // por si se cierra la pestaña mientras Lightning resuelve el pago.
  // Devuelve { state: 'PAID' | 'PENDING', change }.
  async payInvoice(mintUrl, quote, proofs, onReserve) {
    const w = await getWallet(mintUrl)
    const total = quote.raw.amount.add(quote.raw.fee_reserve)
    const { keep, send } = await w.send(total, proofs, { includeFees: true })
    onReserve({ keep, send })
    try {
      const res = await w.meltProofsBolt11(quote.raw, send)
      const state = res.quote?.state ?? 'PAID'
      if (state === 'UNPAID') throw new Error('El mint no pudo pagar la invoice')
      return { state, change: res.change ?? [], preimage: res.quote?.payment_preimage ?? null }
    } catch (e) {
      // Si podemos confirmar que las proofs no se gastaron, el pago falló limpio.
      const settled = await this.checkMelt(mintUrl, quote.raw.quote, send).catch(() => null)
      const err = new Error(e?.message || 'El pago falló')
      if (settled?.state === 'UNPAID') err.recovered = settled.unspent
      else err.unknown = true // estado incierto: queda "en tránsito" y se revisa en segundo plano
      throw err
    }
  },

  // Resuelve un pago que quedó en tránsito. Devuelve
  // { state: 'PAID' | 'PENDING' | 'UNPAID', unspent } donde `unspent` son las proofs recuperables.
  async checkMelt(mintUrl, quoteId, proofs) {
    const w = await getWallet(mintUrl)
    const [q, states] = await Promise.all([w.checkMeltQuoteBolt11(quoteId), w.checkProofsStates(proofs)])
    const unspent = proofs.filter((_, i) => states[i]?.state === 'UNSPENT')
    if (q.state === 'PAID') return { state: 'PAID', unspent: [] }
    if (q.state === 'PENDING' || states.some((s) => s.state === 'PENDING')) return { state: 'PENDING', unspent: [] }
    return { state: 'UNPAID', unspent }
  },

  encodeToken: (mint, proofs) => getEncodedToken({ mint, proofs, unit: 'sat' }),

  // ¿Ya cobraron un token que envié? Si no, lo podemos recuperar con receiveToken.
  async isTokenSpent(token) {
    const meta = getTokenMetadata(token)
    const w = await getWallet(meta.mint)
    const decoded = w.decodeToken(token)
    const states = await w.checkProofsStates(decoded.proofs)
    return states.every((s) => s.state === 'SPENT')
  },
}

export { MintQuoteState }
