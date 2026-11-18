import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { realBackend, amountOf, sumOf } from './cashu.js'
import { demoBackend, DEMO_MINT } from './demo.js'
import { resolvePayTarget, requestInvoice } from './lnurl.js'
import { classify } from './parse.js'
import { postPayment } from './request.js'

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

// Accepts a plain token, a cashu: URI or a token hidden in an emoji, and returns the bare token.
const unwrapToken = (t) => {
  const r = classify(t)
  return r.kind === 'token' ? r.value : String(t || '').trim()
}

const normUrl = (u) => u.trim().replace(/\/+$/, '')
// Payments this tab is still waiting on: the background loop leaves them alone.
const meltsInProgress = new Set()
let syncing = false
const sentSecretsCache = new Map() // token → secrets of its proofs

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
  // Appends proofs, skipping any already there (a sync may have added them first).
  const addProofs = (s, url, ps) => {
    const cur = s.proofs[url] || []
    const have = new Set(cur.map((p) => p.secret))
    const add = ps.filter((p) => !have.has(p.secret) && have.add(p.secret))
    return setProofs(s, url, [...cur, ...add])
  }
  // Takes out the proofs a swap consumed and puts in the new ones, leaving the rest untouched.
  const swapProofs = (s, url, used, fresh) => {
    const gone = new Set(used.map((p) => p.secret))
    return addProofs(setProofs(s, url, (s.proofs[url] || []).filter((p) => !gone.has(p.secret))), url, fresh)
  }

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
      async createInvoice(amount, mint = ref.current.active) {
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
            addHistory(addProofs(s, inv.mint, proofs), {
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
      tokenInfo: (t) => backend.tokenInfo(unwrapToken(t)),
      async receiveToken(raw) {
        const token = unwrapToken(raw)
        const info = backend.tokenInfo(token)
        const mint = await ensureMint(info.mint)
        const { proofs } = await backend.receiveToken(token)
        fire('pour')
        commit((s) =>
          addHistory(addProofs({ ...s, active: mint }, mint, proofs), {
            type: 'ecash-in',
            amount: sumOf(proofs),
            mint,
            memo: info.memo,
          }),
        )
        return sumOf(proofs)
      },

      // 🌰 → token. `offline`: hand over existing coins without asking the mint (exact amounts only).
      // `lock`: P2PK lock asked by a payment request. Returns { token, send, mint, offline }.
      async sendEcash(amount, memo, { mint = ref.current.active, offline = false, lock } = {}) {
        const proofs = ref.current.proofs[mint] || []
        if (sumOf(proofs) < amount) throw new Error("You don't have enough acorns on this mint")
        if (offline && lock) throw new Error('This request wants locked ecash, which needs the mint: connect to the internet to pay it.')
        let res
        if (offline) res = backend.sendOffline(mint, amount, proofs, memo)
        else res = await backend.sendEcash(mint, amount, proofs, memo, lock)
        fire('toss')
        commit((s) =>
          addHistory(swapProofs(s, mint, proofs, res.keep), { type: 'ecash-out', amount, mint, token: res.token, memo, ...(offline ? { offline: true } : {}) }),
        )
        return { token: res.token, send: res.send, mint, offline }
      },
      // What can go out offline near `amount` on `mint`: { ok, below, above }.
      offlineOptions: (amount, mint = ref.current.active) =>
        backend.offlineOptions ? backend.offlineOptions(mint, amount, ref.current.proofs[mint] || []) : { ok: false },
      // Re-splits the coins so small amounts can be sent offline. Returns the fee paid.
      async preparePocket(mint = ref.current.active) {
        const proofs = ref.current.proofs[mint] || []
        if (!proofs.length) throw new Error('No acorns on this mint yet')
        const { proofs: fresh, fee } = await backend.preparePocket(mint, proofs)
        fire('shake')
        commit((s) => {
          const next = swapProofs(s, mint, proofs, fresh)
          return fee ? addHistory(next, { type: 'fee', amount: fee, mint, memo: 'Coins split for offline use' }) : next
        })
        return fee
      },

      // 📝 Pay a NUT-18 request (see request.js). Returns { token, delivered }:
      // delivered = the payee got it over HTTP; otherwise the token goes back by hand.
      async payRequest(req, amount, { mint, offline = false } = {}) {
        if (req.unit !== 'sat') throw new Error(`This request is in ${req.unit}; Bellota only pays sats.`)
        const memo = req.description ? `Payment: ${req.description}`.slice(0, 80) : undefined
        const out = await actions.sendEcash(amount, memo, { mint, offline, lock: req.lock })
        let delivered = false
        if (req.post && !offline) delivered = await postPayment(req, out.mint, out.send, memo).catch(() => false)
        if (delivered) commit((s) => ({ ...s, history: s.history.map((h) => (h.token === out.token ? { ...h, delivered: true } : h)) }))
        return { token: out.token, delivered, mint: out.mint }
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
      async payInvoice(quote, mint = ref.current.active) {
        const proofs = ref.current.proofs[mint] || []
        if (sumOf(proofs) < quote.amount + quote.fee) throw new Error('Not enough balance (amount + fee reserve)')
        const id = hid()
        const dropInflight = (s) => ({ ...s, inflight: s.inflight.filter((f) => f.id !== id) })
        meltsInProgress.add(id)
        try {
          const res = await backend.payInvoice(mint, quote, proofs, ({ keep, send }) =>
            // Persist BEFORE the melt: the old proofs are worthless after the swap.
            commit((s) => ({
              ...swapProofs(s, mint, proofs, keep),
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
            addHistory(dropInflight(addProofs(s, mint, res.change)), {
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
            commit((s) => dropInflight(addProofs(s, mint, e.recovered)))
          else if (e.unknown) e.message += " — We don't know if it went through: the acorns stay in transit until it's confirmed."
          throw e
        } finally {
          meltsInProgress.delete(id)
        }
      },
      // ↔️ Move sats between mints: the destination mint issues an invoice, the source mint pays it.
      // Step 1: quote. Returns { from, to, amount, fee, inv, quote } for the confirmation screen.
      async quoteTransfer(from, to, amount) {
        if (from === to) throw new Error('Pick two different mints')
        const inv = await actions.createInvoice(amount, to)
        try {
          const quote = await backend.meltQuote(from, inv.request)
          if (quote.amount !== amount) throw new Error(`The mint quoted ${quote.amount} sats instead of ${amount}`)
          return { from, to, amount, fee: quote.fee, inv, quote }
        } catch (e) {
          actions.cancelInvoice(inv.quote)
          throw e
        }
      },
      // Largest amount that fits after the Lightning fee reserve and the mint's input fee.
      async maxTransfer(from, to) {
        const proofs = ref.current.proofs[from] || []
        const bal = sumOf(proofs)
        const inFee = backend.inputFee ? await backend.inputFee(from, proofs) : 0
        let amount = bal - inFee
        for (let i = 0; i < 3 && amount > 0; i++) {
          const t = await actions.quoteTransfer(from, to, amount)
          actions.cancelInvoice(t.inv.quote)
          const over = amount + t.fee + inFee - bal
          if (over <= 0) return amount
          amount -= over
        }
        if (amount <= 0) throw new Error('Not enough balance to cover the fees')
        return amount
      },
      // Step 2: pay. The destination's invoice is already pending, so it's claimed here and,
      // if anything gets interrupted, by the background loop.
      async confirmTransfer(t) {
        const toName = ref.current.mints.find((m) => m.url === t.to)?.name
        const st = await actions.payInvoice({ ...t.quote, to: `${toName || new URL(t.to).host} (your mint)` }, t.from)
        if (st !== 'PAID') return 'PENDING'
        for (let i = 0; i < 5; i++) {
          const r = await actions.pollInvoice({ ...t.inv }).catch(() => null)
          if (r === 'CLAIMED' || r === 'ISSUED') break
          await new Promise((res) => setTimeout(res, 1200))
        }
        commit((s) => ({ ...s, active: t.to }))
        return 'DONE'
      },
      cancelTransfer: (t) => actions.cancelInvoice(t.inv.quote),

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
            next = addProofs(next, f.mint, r.unspent)
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

      // 🔄 Same seed on several devices: each one keeps its own copy of the proofs.
      // This asks every mint what's really spendable: drops what another device spent and
      // picks up what it received. Returns { added, removed, failed } in sats / mint count.
      async sync() {
        if (!backend.sync || syncing) return null
        syncing = true
        let added = 0
        let removed = 0
        let failed = 0
        try {
          for (const { url } of ref.current.mints) {
            if (meltsInProgress.size) break // a payment is mid-swap: try again on the next tick
            let res
            try {
              res = await backend.sync(url, ref.current.proofs[url] || [])
            } catch {
              failed++
              continue
            }
            // Tokens this device sent (from before sends used random secrets) aren't balance.
            const sent = new Set()
            if (res.found.length) {
              for (const h of ref.current.history) {
                if (h.type !== 'ecash-out' || !h.token || h.mint !== url) continue
                if (!sentSecretsCache.has(h.token)) sentSecretsCache.set(h.token, await backend.tokenSecrets(h.token).catch(() => []))
                for (const sec of sentSecretsCache.get(h.token)) sent.add(sec)
              }
            }
            let gained = 0
            let lost = 0
            commit((s) => {
              const spent = new Set(res.spent)
              const cur = s.proofs[url] || []
              const kept = cur.filter((p) => !spent.has(p.secret))
              lost = sumOf(cur) - sumOf(kept)
              const known = new Set([...kept, ...s.inflight.flatMap((f) => f.proofs)].map((p) => p.secret))
              const fresh = res.found.filter((p) => !known.has(p.secret) && !sent.has(p.secret) && known.add(p.secret))
              gained = sumOf(fresh)
              if (!lost && !gained) return s
              let next = setProofs(s, url, [...kept, ...fresh])
              if (gained) next = addHistory(next, { type: 'sync-in', amount: gained, mint: url })
              if (lost) next = addHistory(next, { type: 'sync-out', amount: lost, mint: url })
              return next
            })
            if (gained) fire('pour')
            added += gained
            removed += lost
          }
        } finally {
          syncing = false
        }
        return { added, removed, failed }
      },

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
                addHistory(addProofs({ ...s, active: url }, url, fresh), { type: 'restore', amount, mint: url }),
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

  // Keep in step with other devices using the same seed: on open, when the tab comes back, and every minute.
  useEffect(() => {
    if (!backend.sync) return
    const run = () => actions.sync().catch(() => {})
    const first = setTimeout(run, 1500)
    const id = setInterval(run, 60_000)
    const onVisible = () => document.visibilityState === 'visible' && run()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(first)
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [actions, backend])

  return { mode, setMode, backend, state, activeProofs, balance, inTransit, total, fx, actions, amountOf }
}
