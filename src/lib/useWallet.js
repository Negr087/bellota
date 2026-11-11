import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { realBackend, amountOf, sumOf } from './cashu.js'
import { demoBackend, DEMO_MINT } from './demo.js'
import { resolvePayTarget, requestInvoice } from './lnurl.js'

/* global __FORCE_DEMO__ */
export const FORCE_DEMO = typeof __FORCE_DEMO__ !== 'undefined' && __FORCE_DEMO__

export const SUGGESTED_MINTS = [
  { url: 'https://testnut.cashu.space', note: 'Test mint (fake sats, invoices pay themselves)' },
  { url: 'https://mint.minibits.cash/Bitcoin', note: 'Minibits — real sats' },
  { url: 'https://mint.coinos.io', note: 'Coinos — real sats' },
]

const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem(k)
      return v == null ? d : v
    } catch {
      return d
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v)
    } catch {
      /* no storage: keep going in memory */
    }
  },
}

function initialMode() {
  if (FORCE_DEMO) return 'demo'
  const q = new URLSearchParams(location.search)
  if (q.has('demo')) return 'demo'
  return store.get('bellota:mode', 'real')
}

function load(mode) {
  const be = mode === 'demo' ? demoBackend : realBackend
  const p = `bellota:${mode}:`
  const defMints = mode === 'demo' ? [{ url: DEMO_MINT, name: 'Toy mint' }] : [{ url: SUGGESTED_MINTS[0].url, name: 'Testnut' }]
  let mints, proofsRaw, history, pending, inflightRaw
  try {
    mints = JSON.parse(store.get(p + 'mints', 'null')) || defMints
    proofsRaw = JSON.parse(store.get(p + 'proofs', '{}'))
    history = JSON.parse(store.get(p + 'history', '[]'))
    pending = JSON.parse(store.get(p + 'pending', '[]'))
    inflightRaw = JSON.parse(store.get(p + 'inflight', '[]'))
  } catch {
    mints = defMints
    proofsRaw = {}
    history = []
    pending = []
    inflightRaw = []
  }
  // Lightning payments whose outcome we don't know yet: their proofs aren't in the balance
  // but aren't lost either. They get settled in the background.
  const inflight = []
  for (const f of inflightRaw) {
    try {
      inflight.push({ ...f, proofs: be.deserialize(f.proofs) })
    } catch {
      /* corrupted entry: skip it */
    }
  }
  const proofs = {}
  for (const [url, s] of Object.entries(proofsRaw)) {
    try {
      proofs[url] = be.deserialize(s)
    } catch {
      proofs[url] = []
    }
  }
  // Real mode: if there's no seed yet, create it now (before any wallet is built).
  if (be.seed) be.seed.ensure(Object.values(proofs).some((ps) => ps.length))
  const active = store.get(p + 'active', mints[0]?.url)
  return { mints, proofs, history, pending, inflight, active: mints.some((m) => m.url === active) ? active : mints[0]?.url }
}

function save(mode, s) {
  const be = mode === 'demo' ? demoBackend : realBackend
  const p = `bellota:${mode}:`
  const raw = {}
  for (const [url, ps] of Object.entries(s.proofs)) raw[url] = be.serialize(ps)
  store.set(p + 'mints', JSON.stringify(s.mints))
  store.set(p + 'proofs', JSON.stringify(raw))
  store.set(p + 'history', JSON.stringify(s.history.slice(0, 200)))
  store.set(p + 'pending', JSON.stringify(s.pending))
  store.set(p + 'inflight', JSON.stringify(s.inflight.map((f) => ({ ...f, proofs: be.serialize(f.proofs) }))))
  store.set(p + 'active', s.active || '')
}

const normUrl = (u) => u.trim().replace(/\/+$/, '')
// Payments this tab is still waiting on: the background loop leaves them alone.
const meltsInProgress = new Set()

const hid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

export function useWallet() {
  const [mode, setModeState] = useState(initialMode)
  const [state, setState] = useState(() => load(initialMode()))
  // "fx" tells the 3D scene how to animate the next coin change
  const [fx, setFx] = useState({ kind: 'idle', n: 0 })
  const [, setSeedRev] = useState(0) // re-render when something about the seed changes
  const seedChanged = () => setSeedRev((n) => n + 1)
  const ref = useRef(state)
  ref.current = state
  const backend = mode === 'demo' ? demoBackend : realBackend

  const commit = useCallback(
    (fn) => {
      const next = fn(ref.current)
      ref.current = next
      setState(next)
      save(mode, next)
      return next
    },
    [mode],
  )

  const fire = (kind) => setFx((f) => ({ kind, n: f.n + 1 }))

  const setMode = useCallback((m) => {
    if (FORCE_DEMO) return
    store.set('bellota:mode', m)
    setModeState(m)
    const s = load(m)
    ref.current = s
    setState(s)
  }, [])

  const addHistory = (s, entry) => ({ ...s, history: [{ id: hid(), ts: Date.now(), ...entry }, ...s.history] })
  const setProofs = (s, url, ps) => ({ ...s, proofs: { ...s.proofs, [url]: ps } })

  const ensureMint = useCallback(
    async (url, { activate = false } = {}) => {
      url = normUrl(url)
      if (!ref.current.mints.some((m) => m.url === url)) {
        const info = await backend.mintInfo(url) // checks that it exists
        commit((s) => ({ ...s, mints: [...s.mints, { url, name: info.name }] }))
      }
      if (activate) commit((s) => ({ ...s, active: url }))
      return url
    },
    [backend, commit],
  )

  const actions = useMemo(
    () => ({
      setActive: (url) => commit((s) => ({ ...s, active: url })),
      addMint: (url) => ensureMint(url, { activate: true }),
      removeMint: (url) =>
        commit((s) => {
          if ((s.proofs[url] || []).length) throw new Error('That mint still has a balance')
          if (s.inflight.some((f) => f.mint === url)) throw new Error('That mint has a payment in transit')
          const mints = s.mints.filter((m) => m.url !== url)
          return { ...s, mints, active: s.active === url ? mints[0]?.url : s.active }
        }),

      // ⚡ → 🌰
      async createInvoice(amount) {
        const mint = ref.current.active
        const inv = await backend.createInvoice(mint, amount)
        commit((s) => ({ ...s, pending: [{ ...inv, mint, ts: Date.now() }, ...s.pending] }))
        return { ...inv, mint }
      },
      async pollInvoice(inv) {
        const st = await backend.checkInvoice(inv.mint, inv.quote)
        if (st === 'ISSUED') {
          commit((s) => ({ ...s, pending: s.pending.filter((p) => p.quote !== inv.quote) }))
          return 'ISSUED'
        }
        if (st !== 'PAID') return st
        if (!ref.current.pending.some((p) => p.quote === inv.quote)) return 'ISSUED' // another poll already claimed it
        commit((s) => ({ ...s, pending: s.pending.filter((p) => p.quote !== inv.quote) }))
        try {
          const proofs = await backend.claimInvoice(inv.mint, inv.amount, inv.quote)
          fire('pour')
          commit((s) =>
            addHistory(setProofs(s, inv.mint, [...(s.proofs[inv.mint] || []), ...proofs]), {
              type: 'ln-in',
              amount: inv.amount,
              mint: inv.mint,
            }),
          )
          return 'CLAIMED'
        } catch (e) {
          commit((s) => ({ ...s, pending: [inv, ...s.pending] })) // retry later
          throw e
        }
      },
      cancelInvoice: (quote) => commit((s) => ({ ...s, pending: s.pending.filter((p) => p.quote !== quote) })),

      // token → 🌰
      tokenInfo: (t) => backend.tokenInfo(t),
      async receiveToken(token) {
        const info = backend.tokenInfo(token)
        const mint = await ensureMint(info.mint)
        const { proofs } = await backend.receiveToken(token)
        fire('pour')
        commit((s) =>
          addHistory(setProofs({ ...s, active: mint }, mint, [...(s.proofs[mint] || []), ...proofs]), {
            type: 'ecash-in',
            amount: sumOf(proofs),
            mint,
            memo: info.memo,
          }),
        )
        return sumOf(proofs)
      },

      // 🌰 → token
      async sendEcash(amount, memo) {
        const mint = ref.current.active
        const proofs = ref.current.proofs[mint] || []
        if (sumOf(proofs) < amount) throw new Error("You don't have enough acorns on this mint")
        const { keep, token } = await backend.sendEcash(mint, amount, proofs, memo)
        fire('toss')
        commit((s) => addHistory(setProofs(s, mint, keep), { type: 'ecash-out', amount, mint, token, memo }))
        return token
      },
      async reclaim(entry) {
        const amt = await actions.receiveToken(entry.token)
        commit((s) => ({ ...s, history: s.history.map((h) => (h.id === entry.id ? { ...h, reclaimed: true } : h)) }))
        return amt
      },
      isTokenSpent: (t) => backend.isTokenSpent(t),

      // 🌰 → ⚡
      meltQuote: (invoice) => backend.meltQuote(ref.current.active, invoice),

      // ⚡ Lightning Address / LNURL-pay: first what it accepts, then the invoice and the quote
      async resolvePayTarget(target) {
        if (backend.isDemo) return { target, domain: 'demo', min: 1, max: 1_000_000, commentAllowed: 140, desc: `Test payment to ${target}` }
        return resolvePayTarget(target)
      },
      async quoteAddress(info, sats, comment) {
        const pr = backend.isDemo ? `lnbc${sats * 10}n1demo${hid()}${hid()}` : await requestInvoice(info, sats, comment)
        const quote = await backend.meltQuote(ref.current.active, pr)
        // Don't trust the server: the invoice must be for exactly what you asked.
        if (quote.amount !== sats) throw new Error(`The server returned an invoice for ${quote.amount} sats instead of ${sats}. Not paying it.`)
        return { ...quote, to: info.target.startsWith('lnurl') ? info.domain : info.target, memo: comment || undefined }
      },
      async payInvoice(quote) {
        const mint = ref.current.active
        const proofs = ref.current.proofs[mint] || []
        if (sumOf(proofs) < quote.amount + quote.fee) throw new Error('Not enough balance (amount + fee reserve)')
        const id = hid()
        const dropInflight = (s) => ({ ...s, inflight: s.inflight.filter((f) => f.id !== id) })
        meltsInProgress.add(id)
        try {
          const res = await backend.payInvoice(mint, quote, proofs, ({ keep, send }) =>
            // Persist BEFORE the melt: the old proofs are worthless after the swap.
            commit((s) => ({
              ...setProofs(s, mint, keep),
              inflight: [
                { id, mint, quote: quote.raw.quote, amount: quote.amount, fee: quote.fee, proofs: send, ts: Date.now() },
                ...s.inflight,
              ],
            })),
          )
          fire('melt')
          if (res.state === 'PENDING') {
            commit((s) => addHistory(s, { type: 'ln-out', amount: quote.amount, mint, to: quote.to, memo: quote.memo, pending: true, inflightId: id }))
            return 'PENDING'
          }
          const fee = quote.fee - sumOf(res.change) // what the network actually kept
          commit((s) =>
            addHistory(dropInflight(setProofs(s, mint, [...(s.proofs[mint] || []), ...res.change])), {
              type: 'ln-out',
              amount: quote.amount,
              fee: Math.max(0, fee),
              mint,
              to: quote.to,
              memo: quote.memo,
            }),
          )
          return 'PAID'
        } catch (e) {
          if (e.recovered)
            commit((s) => dropInflight(setProofs(s, mint, [...(s.proofs[mint] || []), ...e.recovered])))
          else if (e.unknown) e.message += " — We don't know if it went through: the acorns stay in transit until it's confirmed."
          throw e
        } finally {
          meltsInProgress.delete(id)
        }
      },
      // Checks an in-transit payment with the mint and closes it if it's settled.
      async resolveInflight(f) {
        const r = await backend.checkMelt(f.mint, f.quote, f.proofs)
        if (r.state === 'PENDING') return 'PENDING'
        commit((s) => {
          if (!s.inflight.some((x) => x.id === f.id)) return s // another tick already settled it
          let next = { ...s, inflight: s.inflight.filter((x) => x.id !== f.id) }
          const wasLogged = s.history.some((h) => h.inflightId === f.id)
          if (r.state === 'PAID') {
            next = wasLogged
              ? { ...next, history: next.history.map((h) => (h.inflightId === f.id ? { ...h, pending: false } : h)) }
              : addHistory(next, { type: 'ln-out', amount: f.amount, mint: f.mint })
          } else {
            next = setProofs(next, f.mint, [...(next.proofs[f.mint] || []), ...r.unspent])
            if (wasLogged) next = { ...next, history: next.history.map((h) => (h.inflightId === f.id ? { ...h, pending: false, failed: true } : h)) }
          }
          return next
        })
        if (r.state === 'UNPAID' && r.unspent.length) fire('pour')
        return r.state
      },

      // Backup: one token per mint with the whole balance
      exportBackup() {
        return ref.current.mints
          .map((m) => ({ mint: m.url, proofs: ref.current.proofs[m.url] || [] }))
          .filter((x) => x.proofs.length)
          .map((x) => ({ mint: x.mint, amount: sumOf(x.proofs), token: backend.encodeToken(x.mint, x.proofs) }))
      },
      shake: () => fire('shake'),

      // 🌱 Seed (NUT-13)
      markBackedUp() {
        backend.seed?.markBackedUp()
        seedChanged()
      },
      // Restores a seed's balance on the given mints. Returns the result per mint.
      async restoreFromSeed(mnemonic, urls, onProgress) {
        const hadBalance = Object.values(ref.current.proofs).some((ps) => ps.length)
        backend.seed.replace(mnemonic, hadBalance)
        seedChanged()
        const results = []
        for (const raw of urls) {
          let url = normUrl(raw)
          try {
            onProgress?.({ url, phase: 'connect' })
            url = await ensureMint(url)
            const found = await backend.restore(url, (p) => onProgress?.({ url, phase: 'scan', ...p }))
            const have = new Set((ref.current.proofs[url] || []).map((p) => p.secret))
            const fresh = found.filter((p) => !have.has(p.secret))
            const amount = sumOf(fresh)
            if (amount > 0) {
              fire('pour')
              commit((s) =>
                addHistory(setProofs({ ...s, active: url }, url, [...(s.proofs[url] || []), ...fresh]), { type: 'restore', amount, mint: url }),
              )
            }
            results.push({ url, amount })
          } catch (e) {
            results.push({ url, error: e?.message || String(e) })
          }
        }
        seedChanged()
        return results
      },
      // Moves pre-seed balance into seed-derived proofs (so the seed covers it).
      async migrateToSeed() {
        let moved = 0
        for (const [url, ps] of Object.entries(ref.current.proofs)) {
          if (!ps.length) continue
          const fresh = await backend.reissue(url, ps)
          commit((s) => setProofs(s, url, fresh))
          moved += sumOf(fresh)
        }
        backend.seed.clearLegacy()
        seedChanged()
        fire('shake')
        return moved
      },
    }),
    [backend, commit, ensureMint],
  )

  const activeProofs = state.proofs[state.active] || []
  const balance = sumOf(activeProofs)
  const total = Object.values(state.proofs).reduce((s, ps) => s + sumOf(ps), 0)
  const inTransit = state.inflight.filter((f) => f.mint === state.active).reduce((s, f) => s + sumOf(f.proofs), 0)

  // Retry pending invoices when the app opens
  useEffect(() => {
    let alive = true
    const tick = async () => {
      for (const inv of ref.current.pending) {
        if (!alive) return
        if (Date.now() - inv.ts > 1000 * 60 * 60 * 24) {
          actions.cancelInvoice(inv.quote)
          continue
        }
        try {
          await actions.pollInvoice(inv)
        } catch {
          /* network down: retry later */
        }
      }
      for (const f of ref.current.inflight) {
        if (!alive) return
        if (meltsInProgress.has(f.id)) continue // the payment is still running in this tab
        try {
          await actions.resolveInflight(f)
        } catch {
          /* network down: retry later */
        }
      }
    }
    const id = setInterval(tick, 4000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [actions])

  return { mode, setMode, backend, state, activeProofs, balance, inTransit, total, fx, actions, amountOf }
}
