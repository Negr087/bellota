// Demo backend: simulates a mint without touching the network.
// Lets you try the 3D experience without real sats (and works offline).
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const rid = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)

export const DEMO_MINT = 'https://demo.bellota.local'

// Same as Cashu: amounts are split into powers of 2.
export function splitPow2(n) {
  const out = []
  for (let b = 0; n > 0; b++, n >>= 1) if (n & 1) out.push(1 << b)
  return out.reverse()
}

const makeProofs = (amount) =>
  splitPow2(amount).map((a) => ({ id: '00demo', amount: a, secret: rid(), C: '02' + rid() }))

const sum = (ps) => ps.reduce((s, p) => s + p.amount, 0)

function select(amount, proofs) {
  const sorted = [...proofs].sort((a, b) => b.amount - a.amount)
  const picked = []
  let total = 0
  for (const p of sorted) {
    if (total >= amount) break
    picked.push(p)
    total += p.amount
  }
  if (total < amount) throw new Error('Insufficient balance')
  const rest = proofs.filter((p) => !picked.includes(p))
  // "swap": change comes back as fresh proofs
  return { send: makeProofs(amount), keep: [...rest, ...makeProofs(total - amount)] }
}

const encode = (obj) => 'cashuDemo' + btoa(unescape(encodeURIComponent(JSON.stringify(obj))))
const decode = (tok) => {
  if (!tok.startsWith('cashuDemo')) throw new Error('Demo mode only accepts demo tokens (cashuDemo…)')
  return JSON.parse(decodeURIComponent(escape(atob(tok.slice(9)))))
}

const paidAt = new Map()
const spentTokens = new Set()

function invoiceSats(inv) {
  const m = inv.trim().toLowerCase().replace(/^lightning:/, '').match(/^ln(?:bc|tb|bcrt|tbs)(\d+)([munp]?)1/)
  if (!m) return null
  const n = Number(m[1])
  const mult = { '': 1e8, m: 1e5, u: 100, n: 0.1, p: 0.0001 }[m[2]]
  return Math.max(1, Math.round(n * mult))
}

export const demoBackend = {
  isDemo: true,
  seed: null, // the demo has no seed: the sats are toys
  serialize: (proofs) => JSON.stringify(proofs),
  deserialize: (str) => JSON.parse(str || '[]'),

  async mintInfo() {
    await wait(200)
    return { name: 'Toy mint', description: 'Pretend sats for testing' }
  },

  async createInvoice(_mint, amount) {
    await wait(500)
    const quote = rid()
    paidAt.set(quote, Date.now() + 3500) // "pays itself" after 3.5 s
    const request = `lnbc${amount * 10}n1demo${rid()}${rid()}${rid()}`.slice(0, 180)
    return { quote, request, amount, expiry: null }
  },

  async checkInvoice(_mint, quote) {
    await wait(150)
    const t = paidAt.get(quote)
    if (t === -1) return 'ISSUED'
    return t && Date.now() >= t ? 'PAID' : 'UNPAID'
  },

  async claimInvoice(_mint, amount, quote) {
    await wait(400)
    paidAt.set(quote, -1)
    return makeProofs(amount)
  },

  tokenInfo(token) {
    const t = decode(token.trim())
    return { mint: t.mint, amount: sum(t.proofs), unit: 'sat', memo: t.memo }
  },

  async receiveToken(token) {
    await wait(600)
    const t = decode(token.trim())
    if (spentTokens.has(t.nonce)) throw new Error('That token was already claimed')
    spentTokens.add(t.nonce)
    return { mint: t.mint, proofs: makeProofs(sum(t.proofs)) }
  },

  async sendEcash(mint, amount, proofs, memo) {
    await wait(500)
    const { keep, send } = select(amount, proofs)
    const token = encode({ mint, proofs: send, memo, nonce: rid() })
    return { keep, send, token }
  },

  async meltQuote(_mint, invoice) {
    await wait(400)
    const amount = invoiceSats(invoice)
    if (!amount) throw new Error("That doesn't look like a Lightning invoice (lnbc…)")
    return { raw: { invoice }, amount, fee: Math.max(1, Math.ceil(amount * 0.01)) }
  },

  async payInvoice(_mint, quote, proofs, onReserve) {
    await wait(300)
    onReserve(select(quote.amount + quote.fee, proofs))
    await wait(900)
    const change = makeProofs(Math.floor(quote.fee / 2)) // part of the fee reserve comes back
    return { state: 'PAID', change, preimage: rid() }
  },

  // In the demo, payments never get stuck
  async checkMelt() {
    return { state: 'PAID', unspent: [] }
  },

  encodeToken: (mint, proofs) => encode({ mint, proofs, nonce: rid() }),

  async isTokenSpent(token) {
    const t = decode(token)
    return spentTokens.has(t.nonce)
  },
}

// So you can "receive" something from someone in the demo
export function makeGiftToken(amount = 210) {
  return encode({ mint: DEMO_MINT, proofs: makeProofs(amount), memo: 'A test gift! 🌰', nonce: rid() })
}
