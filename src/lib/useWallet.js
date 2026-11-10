import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { realBackend, amountOf, sumOf } from './cashu.js'
import { demoBackend, DEMO_MINT } from './demo.js'

/* global __FORCE_DEMO__ */
export const FORCE_DEMO = typeof __FORCE_DEMO__ !== 'undefined' && __FORCE_DEMO__

export const SUGGESTED_MINTS = [
  { url: 'https://testnut.cashu.space', note: 'Mint de prueba (sats falsos, las invoices se pagan solas)' },
  { url: 'https://mint.minibits.cash/Bitcoin', note: 'Minibits — sats reales' },
  { url: 'https://mint.coinos.io', note: 'Coinos — sats reales' },
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
      /* sin storage: seguimos en memoria */
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
  const defMints = mode === 'demo' ? [{ url: DEMO_MINT, name: 'Mint de juguete' }] : [{ url: SUGGESTED_MINTS[0].url, name: 'Testnut' }]
  let mints, proofsRaw, history, pending
  try {
    mints = JSON.parse(store.get(p + 'mints', 'null')) || defMints
    proofsRaw = JSON.parse(store.get(p + 'proofs', '{}'))
    history = JSON.parse(store.get(p + 'history', '[]'))
    pending = JSON.parse(store.get(p + 'pending', '[]'))
  } catch {
    mints = defMints
    proofsRaw = {}
    history = []
    pending = []
  }
  const proofs = {}
  for (const [url, s] of Object.entries(proofsRaw)) {
    try {
      proofs[url] = be.deserialize(s)
    } catch {
      proofs[url] = []
    }
  }
  const active = store.get(p + 'active', mints[0]?.url)
  return { mints, proofs, history, pending, active: mints.some((m) => m.url === active) ? active : mints[0]?.url }
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
  store.set(p + 'active', s.active || '')
}

const normUrl = (u) => u.trim().replace(/\/+$/, '')
const hid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

export function useWallet() {
  const [mode, setModeState] = useState(initialMode)
  const [state, setState] = useState(() => load(initialMode()))
  // "fx" le dice a la escena 3D cómo animar el próximo cambio de monedas
  const [fx, setFx] = useState({ kind: 'idle', n: 0 })
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
        const info = await backend.mintInfo(url) // valida que exista
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
          if ((s.proofs[url] || []).length) throw new Error('Ese mint todavía tiene saldo')
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
        if (!ref.current.pending.some((p) => p.quote === inv.quote)) return 'ISSUED' // ya lo reclamó otro poll
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
          commit((s) => ({ ...s, pending: [inv, ...s.pending] })) // reintentamos más tarde
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
        if (sumOf(proofs) < amount) throw new Error('No te alcanzan las bellotas en este mint')
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
      async payInvoice(quote) {
        const mint = ref.current.active
        const proofs = ref.current.proofs[mint] || []
        if (sumOf(proofs) < quote.amount + quote.fee) throw new Error('No te alcanza (monto + reserva de comisión)')
        try {
          const { keep, change } = await backend.payInvoice(mint, quote, proofs)
          fire('melt')
          const fee = quote.fee - sumOf(change) // lo que realmente se quedó la red
          commit((s) =>
            addHistory(setProofs(s, mint, [...keep, ...change]), { type: 'ln-out', amount: quote.amount, fee: Math.max(0, fee), mint }),
          )
        } catch (e) {
          if (e.recovered) commit((s) => setProofs(s, mint, e.recovered))
          throw e
        }
      },

      // Respaldo: un token por mint con todo el saldo
      exportBackup() {
        return ref.current.mints
          .map((m) => ({ mint: m.url, proofs: ref.current.proofs[m.url] || [] }))
          .filter((x) => x.proofs.length)
          .map((x) => ({ mint: x.mint, amount: sumOf(x.proofs), token: backend.encodeToken(x.mint, x.proofs) }))
      },
      shake: () => fire('shake'),
    }),
    [backend, commit, ensureMint],
  )

  const activeProofs = state.proofs[state.active] || []
  const balance = sumOf(activeProofs)
  const total = Object.values(state.proofs).reduce((s, ps) => s + sumOf(ps), 0)

  // Reintentar invoices pendientes al abrir la app
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
          /* red caída: reintentamos después */
        }
      }
    }
    const id = setInterval(tick, 4000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [actions])

  return { mode, setMode, backend, state, activeProofs, balance, total, fx, actions, amountOf }
}
