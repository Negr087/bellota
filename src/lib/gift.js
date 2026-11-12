// Gift links: https://…/bellota/#gift=<cashu token>
// The token rides in the URL fragment (after #), which browsers never send to the server,
// so it doesn't end up in any hosting logs. Whoever opens the link can claim it, like any token.
import { classify } from './parse.js'

const KEY = 'bellota:pendingGift' // survives a reload until the gift is opened

export function giftLink(token) {
  const base = location.origin + location.pathname
  return `${base}#gift=${encodeURIComponent(token.trim())}`
}

// Reads a gift from the current URL (and remembers it), or returns a remembered one.
export function takeGiftFromUrl() {
  const m = location.hash.match(/[#&]gift=([^&]+)/)
  if (m) {
    let raw = m[1]
    try {
      raw = decodeURIComponent(raw)
    } catch {
      /* already decoded */
    }
    // Clean the address bar so the token isn't left in history or copied by accident
    history.replaceState(null, '', location.pathname + location.search)
    const r = classify(raw)
    if (r.kind === 'token') {
      try {
        localStorage.setItem(KEY, r.value)
      } catch {
        /* no storage: it still works for this visit */
      }
      return r.value
    }
    return null
  }
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function forgetGift() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* no storage */
  }
}

export const isDemoToken = (t) => /^cashuDemo/.test(t || '')
