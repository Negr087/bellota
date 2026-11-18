// Real backend: talks to Cashu mints using @cashu/cashu-ts.
// The UI only knows this interface; demo mode (demo.js) implements the same one.
import {
  Wallet,
  MintQuoteState,
  getEncodedToken,
  getTokenMetadata,
  serializeProofs,
  deserializeProofs,
  hasValidDleq,
  parseP2PKSecret,
  getP2PKExpectedWitnessPubkeys,
  getPubKeyFromPrivKey,
} from '@cashu/cashu-ts'
import { seedStore, counterSource } from './seed.js'

export const amountOf = (x) =>
  typeof x === 'object' && x !== null && 'toNumber' in x ? x.toNumber() : Number(x)

export const sumOf = (proofs) => proofs.reduce((s, p) => s + amountOf(p.amount), 0)

const wallets = new Map()

// With a seed, every secret is deterministic (NUT-13) and can be restored.
const newWallet = (mintUrl) => {
  const seed = seedStore.seedBytes()
  return new Wallet(mintUrl, seed ? { bip39seed: seed, counterSource } : {}) // unit: sat
}

// The mint's info and keys, saved after every successful connection: offline, that's
// all a wallet needs to pick coins and build a token without talking to the mint.
const cacheKey = (url) => `bellota:real:mintcache:${url}`
function saveMintCache(url, w) {
  try {
    localStorage.setItem(cacheKey(url), JSON.stringify({ info: w.getMintInfo().cache, keys: w.keyChain.cache }))
  } catch {
    /* no storage / quota: offline sends just won't be available for this mint */
  }
}

async function getWallet(mintUrl) {
  if (!wallets.has(mintUrl)) {
    const w = newWallet(mintUrl)
    wallets.set(
      mintUrl,
      w.loadMint().then(() => {
        saveMintCache(mintUrl, w)
        return w
      }),
    )
  }
  try {
    return await wallets.get(mintUrl)
  } catch (e) {
    wallets.delete(mintUrl)
    const err = new Error(`Couldn't connect to the mint (${mintUrl}). ${e?.message ?? ''}`)
    err.unreachable = true // nothing reached the mint: safe to fall back to an offline send
    throw err
  }
}

// A wallet built only from the saved cache (no network at all).
function cachedWallet(mintUrl) {
  let c = null
  try {
    c = JSON.parse(localStorage.getItem(cacheKey(mintUrl)) || 'null')
  } catch {
    /* corrupted cache */
  }
  if (!c) throw new Error("This mint hasn't been opened online on this device yet, so it can't be used offline.")
  const w = newWallet(mintUrl)
  w.loadMintFromCache(c.info, c.keys)
  return w
}

// 🔑 This wallet's P2PK key (NUT-11), derived from the seed so every device with the same
// 12 words can claim ecash locked to it. Payment requests can ask payers to lock to it.
const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
let p2pkCache = null
async function p2pkKeys() {
  const seed = seedStore.seedBytes()
  if (!seed) return null
  if (p2pkCache?.seed === seed) return p2pkCache
  const tag = new TextEncoder().encode('bellota/p2pk/0')
  const priv = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array([...tag, ...seed])))
  p2pkCache = { seed, priv: hex(priv), pub: hex(getPubKeyFromPrivKey(priv)) }
  return p2pkCache
}

// Reads a P2PK secret: null if the proof isn't locked.
function lockOf(secret) {
  try {
    const [, data] = parseP2PKSecret(secret)
    const tags = Object.fromEntries((data.tags || []).map(([k, ...v]) => [k, v]))
    return { keys: getP2PKExpectedWitnessPubkeys(secret).map((k) => k.toLowerCase()), locktime: tags.locktime ? Number(tags.locktime[0]) : null }
  } catch {
    return null
  }
}

// Picks coins that add up to exactly `amount` (+ the fee the receiver pays to swap them).
// No outputs are created, so nothing needs the mint. Returns null if no combination fits.
function pickExact(w, amount, proofs) {
  if (amount <= 0 || sumOf(proofs) < amount) return null
  try {
    const { keep, send } = w.sendOffline(amount, proofs, { includeFees: true, exactMatch: true })
    return send.length ? { keep, send } : null
  } catch {
    return null
  }
}

// Coin split that can pay many amounts without change: two of each power of two
// (1, 1, 2, 2, 4, 4…) while it fits, the rest in the usual binary split.
export function pocketDenominations(total) {
  const out = []
  let left = total
  for (let d = 1; d * 2 <= left; d *= 2) {
    out.push(d, d)
    left -= 2 * d
  }
  for (let d = 2 ** 30; d >= 1; d /= 2) {
    while (left >= d) {
      out.push(d)
      left -= d
    }
  }
  return out.sort((a, b) => a - b)
}

// Largest N such that every amount 1..N can be made exactly from these coins (ignoring fees).
export function exactCoverage(proofs) {
  let reach = 0
  for (const a of proofs.map((p) => amountOf(p.amount)).sort((x, y) => x - y)) {
    if (a > reach + 1) break
    reach += a
  }
  return reach
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
      if (lastCounterWithSignature != null) {
        await counterSource.advanceToAtLeast(ks.id, lastCounterWithSignature + 1)
        seedStore.setScanned(ks.id, lastCounterWithSignature + 1)
      }
      if (!proofs.length) continue
      const states = await w.checkProofsStates(proofs)
      found.push(...proofs.filter((_, j) => states[j]?.state === 'UNSPENT'))
    }
    return found
  },

  // Brings this device in line with the mint when the same seed is used elsewhere.
  // 1) Drops local proofs the mint says are SPENT (spent on another device).
  // 2) Scans the seed from the last synced counter for proofs another device created,
  //    keeping the unspent ones, and moves the counters past them so both devices
  //    don't derive the same outputs.
  // Returns { spent: secrets[], found: proofs[] }.
  async sync(mintUrl, proofs) {
    const w = await getWallet(mintUrl)
    let spent = []
    if (proofs.length) {
      const states = await w.checkProofsStates(proofs)
      spent = proofs.filter((_, i) => states[i]?.state === 'SPENT').map((p) => p.secret)
    }
    const found = []
    if (seedStore.seedBytes()) {
      for (const ks of w.keyChain.getKeysets()) {
        const from = seedStore.scanned(ks.id)
        const { proofs: ps, lastCounterWithSignature } = await w.batchRestore(100, undefined, from, ks.id)
        if (lastCounterWithSignature == null) continue
        await counterSource.advanceToAtLeast(ks.id, lastCounterWithSignature + 1)
        if (ps.length) {
          const states = await w.checkProofsStates(ps)
          found.push(...ps.filter((_, j) => states[j]?.state === 'UNSPENT'))
        }
        seedStore.setScanned(ks.id, lastCounterWithSignature + 1)
      }
    }
    return { spent, found }
  },

  // Secrets of a token's proofs (to tell my own sent tokens apart from found proofs).
  async tokenSecrets(token) {
    const meta = getTokenMetadata(token)
    const w = await getWallet(meta.mint)
    return w.decodeToken(token).proofs.map((p) => p.secret)
  },

  // 📴 Offline send: hands over existing coins as they are, no mint involved.
  sendOffline(mintUrl, amount, proofs, memo) {
    const picked = pickExact(cachedWallet(mintUrl), amount, proofs)
    if (!picked) throw new Error(`Offline you can only send amounts your coins add up to exactly. ${amount} sats doesn't fit.`)
    const token = getEncodedToken({ mint: mintUrl, proofs: picked.send, unit: 'sat', ...(memo ? { memo } : {}) })
    return { keep: picked.keep, send: picked.send, token }
  },

  // What can be sent offline around `amount`: { ok, below, above } (closest exact amounts).
  offlineOptions(mintUrl, amount, proofs) {
    let w
    try {
      w = cachedWallet(mintUrl)
    } catch {
      return { ok: false, below: null, above: null, noCache: true }
    }
    const fits = (n) => !!pickExact(w, n, proofs)
    if (fits(amount)) return { ok: true }
    const total = sumOf(proofs)
    let below = null
    let above = null
    for (let n = amount - 1, i = 0; n > 0 && i < 400; n--, i++) if (fits(n)) { below = n; break }
    for (let n = amount + 1, i = 0; n <= total && i < 400; n++, i++) if (fits(n)) { above = n; break }
    return { ok: false, below, above }
  },

  // Re-splits a mint's coins into a "pocket" (see pocketDenominations) so most small
  // amounts can be sent offline. Costs the mint's input fee, if it charges one.
  async preparePocket(mintUrl, proofs) {
    const w = await getWallet(mintUrl)
    const fee = amountOf(w.getFeesForProofs(proofs))
    const amount = sumOf(proofs) - fee
    if (amount <= 0) throw new Error('Not enough balance to cover the mint fee')
    const det = seedStore.seedBytes() ? { type: 'deterministic', counter: 0 } : { type: 'random' }
    const { keep, send } = await w.send(amount, proofs, { includeFees: false }, { send: { ...det, denominations: pocketDenominations(amount) }, keep: det })
    return { proofs: [...keep, ...send], fee }
  },

  // Input fee the mint charges to spend these proofs.
  async inputFee(mintUrl, proofs) {
    const w = await getWallet(mintUrl)
    return amountOf(w.getFeesForProofs(proofs))
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
    // Locked to my key? Sign it so the mint lets me swap it.
    const locked = w.decodeToken(clean).proofs.some((p) => lockOf(p.secret))
    const keys = locked ? await p2pkKeys() : null
    const proofs = await w.receive(clean, keys ? { privkey: keys.priv } : undefined)
    return { mint: meta.mint, proofs }
  },

  p2pkPubkey: async () => (await p2pkKeys())?.pub ?? null,

  // 📴 What can be known about a token without the mint (NUT-12 DLEQ + NUT-11 locks):
  // { mint, amount, memo, known, dleq: 'ok'|'missing'|'bad'|'unknown', lock: 'me'|'other'|'none'|'mixed', locktime }
  async checkOffline(token) {
    const clean = token.trim()
    const meta = getTokenMetadata(clean)
    const base = { mint: meta.mint.replace(/\/+$/, ''), amount: amountOf(meta.amount), memo: meta.memo, unit: meta.unit || 'sat' }
    let w
    try {
      w = cachedWallet(base.mint)
    } catch {
      return { ...base, known: false, dleq: 'unknown', lock: 'unknown', locktime: null }
    }
    const proofs = w.decodeToken(clean).proofs
    let dleq = 'ok'
    for (const p of proofs) {
      if (!p.dleq) {
        dleq = dleq === 'bad' ? 'bad' : 'missing'
        continue
      }
      let ok = false
      try {
        ok = hasValidDleq(p, w.keyChain.getKeyset(p.id), { require: true })
      } catch {
        ok = false
      }
      if (!ok) dleq = 'bad'
    }
    const me = (await p2pkKeys())?.pub?.toLowerCase()
    const locks = proofs.map((p) => lockOf(p.secret))
    const mine = (l) => l && me && l.keys.includes(me)
    const lock = locks.every((l) => !l) ? 'none' : locks.every(mine) ? 'me' : locks.some((l) => l && !mine(l)) ? 'other' : 'mixed'
    const locktime = locks.reduce((t, l) => (l?.locktime ? Math.min(t ?? Infinity, l.locktime) : t), null)
    return { ...base, known: true, dleq, lock, locktime }
  },

  // 🌰 → token  Send ecash
  // `lock`: P2PK options (NUT-11) when a payment request asks for locked ecash.
  async sendEcash(mintUrl, amount, proofs, memo, lock) {
    const w = await getWallet(mintUrl)
    // The proofs I hand over get random secrets: a seed scan (restore or sync on another
    // device) must never find them and count them as balance. The token stays in History.
    const sendOut = lock ? { type: 'p2pk', options: lock } : { type: 'random' }
    const outputs = seedStore.seedBytes() ? { send: sendOut, keep: { type: 'deterministic', counter: 0 } } : lock ? { send: sendOut } : undefined
    const { keep, send } = await w.send(amount, proofs, { includeFees: true }, outputs)
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
