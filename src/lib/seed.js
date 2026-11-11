// BIP-39 seed + NUT-13 counters.
// With a seed, every proof secret is derived from (seed, keyset, counter):
// if the browser is lost, the mint can re-sign the same outputs and everything comes back.
import { generateMnemonic, validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english'
import { mnemonicToSeedSync } from '@cashu/cashu-ts'

const K = {
  mnemonic: 'bellota:real:mnemonic',
  counters: 'bellota:real:counters',
  backedUp: 'bellota:real:seedBackedUp',
  legacy: 'bellota:real:legacyProofs', // there's balance from before the seed (the seed can't restore it)
}

const get = (k) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const set = (k, v) => {
  try {
    if (v == null) localStorage.removeItem(k)
    else localStorage.setItem(k, v)
  } catch {
    /* no storage */
  }
}

export const normalizeWords = (s) => s.trim().toLowerCase().split(/\s+/).join(' ')
export const isValidMnemonic = (m) => validateMnemonic(normalizeWords(m), wordlist)
export const newMnemonic = () => generateMnemonic(wordlist, 128) // 12 words

let cachedSeed = null
let cachedFor = null

export const seedStore = {
  mnemonic: () => get(K.mnemonic),
  // 64-byte seed (cached: PBKDF2 is slow)
  seedBytes() {
    const m = get(K.mnemonic)
    if (!m) return null
    if (cachedFor !== m) {
      cachedSeed = mnemonicToSeedSync(m)
      cachedFor = m
    }
    return cachedSeed
  },
  // Creates a seed if there is none. `hadBalance`: existing balance is flagged as "legacy".
  ensure(hadBalance) {
    if (get(K.mnemonic)) return false
    set(K.mnemonic, newMnemonic())
    set(K.backedUp, null)
    set(K.counters, null)
    if (hadBalance) set(K.legacy, '1')
    return true
  },
  // Replaces the seed (restore). Counters start at zero: the restore moves them forward.
  replace(mnemonic, hadBalance) {
    const m = normalizeWords(mnemonic)
    if (m === get(K.mnemonic)) return set(K.backedUp, '1') // same seed: leave counters alone
    set(K.mnemonic, m)
    set(K.counters, null)
    set(K.backedUp, '1') // if they typed it, they have it written down
    set(K.legacy, hadBalance ? '1' : null)
  },
  backedUp: () => get(K.backedUp) === '1',
  markBackedUp: () => set(K.backedUp, '1'),
  legacy: () => get(K.legacy) === '1',
  clearLegacy: () => set(K.legacy, null),
}

// Persistent CounterSource. Writes to localStorage BEFORE returning the range,
// so a counter is never reused even if the tab closes mid-operation.
const readCounters = () => {
  try {
    return JSON.parse(get(K.counters) || '{}')
  } catch {
    return {}
  }
}
const writeCounters = (c) => set(K.counters, JSON.stringify(c))

export const counterSource = {
  async reserve(keysetId, n) {
    const c = readCounters()
    const start = c[keysetId] || 0
    if (n > 0) {
      c[keysetId] = start + n
      writeCounters(c)
    }
    return { start, count: n }
  },
  async reserveAt(keysetId, start, count) {
    const c = readCounters()
    const next = c[keysetId] || 0
    if (start < next) throw new Error(`Counter ${start} already used on keyset ${keysetId}`)
    c[keysetId] = start + count
    writeCounters(c)
    return { start, count }
  },
  async advanceToAtLeast(keysetId, minNext) {
    const c = readCounters()
    if ((c[keysetId] || 0) < minNext) {
      c[keysetId] = minNext
      writeCounters(c)
    }
  },
  async snapshot() {
    return readCounters()
  },
  async setNext(keysetId, next) {
    const c = readCounters()
    c[keysetId] = next
    writeCounters(c)
  },
}
