// Real backend: talks to Cashu mints using @cashu/cashu-ts.
// The UI only knows this interface; demo mode (demo.js) implements the same one.
import {
  Wallet,
  MintQuoteState,
  getEncodedToken,
  getTokenMetadata,
  serializeProofs,
  deserializeProofs,
} from '@cashu/cashu-ts'
import { seedStore, counterSource } from './seed.js'

export const amountOf = (x) =>
  typeof x === 'object' && x !== null && 'toNumber' in x ? x.toNumber() : Number(x)

export const sumOf = (proofs) => proofs.reduce((s, p) => s + amountOf(p.amount), 0)

const wallets = new Map()

async function getWallet(mintUrl) {
  if (!wallets.has(mintUrl)) {
    // With a seed, every secret is deterministic (NUT-13) and can be restored.
    const seed = seedStore.seedBytes()
    const w = new Wallet(mintUrl, seed ? { bip39seed: seed, counterSource } : {}) // unit: sat
    wallets.set(
      mintUrl,
      w.loadMint().then(() => w),
    )
  }
  try {
    return await wallets.get(mintUrl)
  } catch (e) {
    wallets.delete(mintUrl)
    throw new Error(`Couldn't connect to the mint (${mintUrl}). ${e?.message ?? ''}`)
  }
}

export const realBackend = {
  isDemo: false,

  // 🌱 Seed (NUT-13)
  seed: {
    words: () => seedStore.mnemonic()?.split(' ') ?? [],
    backedUp: () => seedStore.backedUp(),
    markBackedUp: () => seedStore.markBackedUp(),
    legacy: () => seedStore.legacy(),
    clearLegacy: () => seedStore.clearLegacy(),
    ensure(hadBalance) {
      if (seedStore.ensure(hadBalance)) wallets.clear()
    },
    replace(mnemonic, hadBalance) {
      seedStore.replace(mnemonic, hadBalance)
      wallets.clear() // cached wallets hold the old seed
    },
  },

  // Restores the seed's proofs on a mint: walks every keyset (active and inactive),
  // asks the mint to re-sign the derived outputs and keeps the unspent ones.
  async restore(mintUrl, onProgress) {
    const w = await getWallet(mintUrl)
    const keysets = w.keyChain.getKeysets()
    const found = []
    for (const [i, ks] of keysets.entries()) {
      onProgress?.({ keyset: ks.id, i, n: keysets.length })
      const { proofs, lastCounterWithSignature } = await w.batchRestore(300, undefined, 0, ks.id)
      // Even if spent, those counters were used: never reuse them.
      if (lastCounterWithSignature != null) await counterSource.advanceToAtLeast(ks.id, lastCounterWithSignature + 1)
      if (!proofs.length) continue
      const states = await w.checkProofsStates(proofs)
      found.push(...proofs.filter((_, j) => states[j]?.state === 'UNSPENT'))
    }
    return found
  },

  // Swaps old (pre-seed) proofs for new proofs derived from the seed.
  async reissue(mintUrl, proofs) {
    const w = await getWallet(mintUrl)
    return w.receive(getEncodedToken({ mint: mintUrl, proofs, unit: 'sat' }))
  },

  serialize: (proofs) => JSON.stringify(serializeProofs(proofs)),
  deserialize: (str) => deserializeProofs(str || '[]'),

  async mintInfo(mintUrl) {
    const w = await getWallet(mintUrl)
    const info = w.getMintInfo()
    return { name: info.name || new URL(mintUrl).host, description: info.description }
  },

  // ⚡ → 🌰  Receive via Lightning (NUT-04)
  async createInvoice(mintUrl, amount) {
    const w = await getWallet(mintUrl)
    const q = await w.createMintQuoteBolt11(amount, 'Bellota 🌰')
    return { quote: q.quote, request: q.request, amount, expiry: q.expiry }
  },

  // Returns 'UNPAID' | 'PAID' | 'ISSUED'
  async checkInvoice(mintUrl, quote) {
    const w = await getWallet(mintUrl)
    const q = await w.checkMintQuoteBolt11(quote)
    return q.state
  },

  async claimInvoice(mintUrl, amount, quote) {
    const w = await getWallet(mintUrl)
    return w.mintProofsBolt11(amount, quote)
  },

  // 🌰 Receive ecash (cashuA/cashuB token)
  tokenInfo(token) {
    const meta = getTokenMetadata(token.trim())
    return { mint: meta.mint, amount: amountOf(meta.amount), unit: meta.unit, memo: meta.memo }
  },

  async receiveToken(token) {
    const clean = token.trim()
    const meta = getTokenMetadata(clean)
    if (meta.unit && meta.unit !== 'sat') throw new Error(`Only sats are supported for now (this token is in ${meta.unit}).`)
    const w = await getWallet(meta.mint)
    const proofs = await w.receive(clean)
    return { mint: meta.mint, proofs }
  },

  // 🌰 → token  Send ecash
  async sendEcash(mintUrl, amount, proofs, memo) {
    const w = await getWallet(mintUrl)
    const { keep, send } = await w.send(amount, proofs, { includeFees: true })
    const token = getEncodedToken({ mint: mintUrl, proofs: send, unit: 'sat', ...(memo ? { memo } : {}) })
    return { keep, send, token }
  },

  // 🌰 → ⚡  Pay an invoice (NUT-05)
  async meltQuote(mintUrl, invoice) {
    const w = await getWallet(mintUrl)
    const q = await w.createMeltQuoteBolt11(invoice.trim().replace(/^lightning:/i, ''))
    return { raw: q, amount: amountOf(q.amount), fee: amountOf(q.fee_reserve) }
  },

  // `onReserve({ keep, send })` is called as soon as the swap splits the proofs, BEFORE the melt:
  // the swap invalidates the old proofs, so keep/send must be persisted right away
  // in case the tab is closed while Lightning settles the payment.
  // Returns { state: 'PAID' | 'PENDING', change }.
  async payInvoice(mintUrl, quote, proofs, onReserve) {
    const w = await getWallet(mintUrl)
    const total = quote.raw.amount.add(quote.raw.fee_reserve)
    const { keep, send } = await w.send(total, proofs, { includeFees: true })
    onReserve({ keep, send })
    try {
      const res = await w.meltProofsBolt11(quote.raw, send)
      const state = res.quote?.state ?? 'PAID'
      if (state === 'UNPAID') throw new Error('The mint could not pay the invoice')
      return { state, change: res.change ?? [], preimage: res.quote?.payment_preimage ?? null }
    } catch (e) {
      // If we can confirm the proofs weren't spent, the payment failed cleanly.
      const settled = await this.checkMelt(mintUrl, quote.raw.quote, send).catch(() => null)
      const err = new Error(e?.message || 'Payment failed')
      if (settled?.state === 'UNPAID') err.recovered = settled.unspent
      else err.unknown = true // unknown outcome: stays "in transit" and is checked in the background
      throw err
    }
  },

  // Settles a payment left in transit. Returns
  // { state: 'PAID' | 'PENDING' | 'UNPAID', unspent } where `unspent` are the recoverable proofs.
  async checkMelt(mintUrl, quoteId, proofs) {
    const w = await getWallet(mintUrl)
    const [q, states] = await Promise.all([w.checkMeltQuoteBolt11(quoteId), w.checkProofsStates(proofs)])
    const unspent = proofs.filter((_, i) => states[i]?.state === 'UNSPENT')
    if (q.state === 'PAID') return { state: 'PAID', unspent: [] }
    if (q.state === 'PENDING' || states.some((s) => s.state === 'PENDING')) return { state: 'PENDING', unspent: [] }
    return { state: 'UNPAID', unspent }
  },

  encodeToken: (mint, proofs) => getEncodedToken({ mint, proofs, unit: 'sat' }),

  // Has a token I sent been claimed? If not, it can be reclaimed with receiveToken.
  async isTokenSpent(token) {
    const meta = getTokenMetadata(token)
    const w = await getWallet(meta.mint)
    const decoded = w.decodeToken(token)
    const states = await w.checkProofsStates(decoded.proofs)
    return states.every((s) => s.state === 'SPENT')
  },
}

export { MintQuoteState }
