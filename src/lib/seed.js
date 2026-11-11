// Semilla BIP-39 + contadores NUT-13.
// Con la semilla, cada secreto de cada proof se deriva de (semilla, keyset, contador):
// si se pierde el navegador, el mint puede volver a firmar lo mismo y recuperamos todo.
import { generateMnemonic, validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english'
import { mnemonicToSeedSync } from '@cashu/cashu-ts'

const K = {
  mnemonic: 'bellota:real:mnemonic',
  counters: 'bellota:real:counters',
  backedUp: 'bellota:real:seedBackedUp',
  legacy: 'bellota:real:legacyProofs', // hay saldo de antes de la semilla (no se recupera con ella)
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
    /* sin storage */
  }
}

export const normalizeWords = (s) => s.trim().toLowerCase().split(/\s+/).join(' ')
export const isValidMnemonic = (m) => validateMnemonic(normalizeWords(m), wordlist)
export const newMnemonic = () => generateMnemonic(wordlist, 128) // 12 palabras

let cachedSeed = null
let cachedFor = null

export const seedStore = {
  mnemonic: () => get(K.mnemonic),
  // Semilla de 64 bytes (cacheada: PBKDF2 es lento)
  seedBytes() {
    const m = get(K.mnemonic)
    if (!m) return null
    if (cachedFor !== m) {
      cachedSeed = mnemonicToSeedSync(m)
      cachedFor = m
    }
    return cachedSeed
  },
  // Crea una semilla si no hay. `hadBalance`: el saldo previo queda marcado como "legacy".
  ensure(hadBalance) {
    if (get(K.mnemonic)) return false
    set(K.mnemonic, newMnemonic())
    set(K.backedUp, null)
    set(K.counters, null)
    if (hadBalance) set(K.legacy, '1')
    return true
  },
  // Reemplaza la semilla (restore). Los contadores arrancan de cero: el restore los adelanta.
  replace(mnemonic, hadBalance) {
    const m = normalizeWords(mnemonic)
    if (m === get(K.mnemonic)) return set(K.backedUp, '1') // misma semilla: no tocamos contadores
    set(K.mnemonic, m)
    set(K.counters, null)
    set(K.backedUp, '1') // si la tipeó, ya la tiene anotada
    set(K.legacy, hadBalance ? '1' : null)
  },
  backedUp: () => get(K.backedUp) === '1',
  markBackedUp: () => set(K.backedUp, '1'),
  legacy: () => get(K.legacy) === '1',
  clearLegacy: () => set(K.legacy, null),
}

// CounterSource persistente. Se escribe en localStorage ANTES de devolver el rango:
// así un contador nunca se reusa aunque la pestaña se cierre en mitad de una operación.
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
    if (start < next) throw new Error(`Contador ${start} ya usado en el keyset ${keysetId}`)
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
