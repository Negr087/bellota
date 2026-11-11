// Cashu tokens hidden in an emoji, the same scheme cashu.me uses (cashubtc/cashu.me#334):
// a visible emoji followed by one invisible Unicode variation selector per byte of the token.
//   byte 0–15   → U+FE00  + byte          (VS1–VS16)
//   byte 16–255 → U+E0100 + (byte − 16)   (VS17–VS256)
// Copy-paste keeps the selectors, so the emoji carries the whole token.
// Note: it's hidden, not encrypted. Whoever has the emoji can claim the token.

// Single-code-point emoji that don't need a VS16 of their own (a trailing U+FE0F would corrupt byte 15).
export const CARRIERS = ['🥜', '🌰', '🎁', '🍪', '⚡']

const toSelector = (b) => String.fromCodePoint(b < 16 ? 0xfe00 + b : 0xe0100 + (b - 16))
const fromSelector = (cp) => (cp >= 0xfe00 && cp <= 0xfe0f ? cp - 0xfe00 : cp >= 0xe0100 && cp <= 0xe01ef ? cp - 0xe0100 + 16 : -1)

export function encodeEmoji(token, carrier = CARRIERS[0]) {
  const bytes = new TextEncoder().encode(token.trim())
  let out = carrier
  for (const b of bytes) out += toSelector(b)
  return out
}

// Returns the hidden text, or null if there's no (meaningful) hidden payload.
export function decodeEmoji(text) {
  const bytes = []
  for (const ch of String(text || '')) {
    const b = fromSelector(ch.codePointAt(0))
    if (b >= 0) bytes.push(b)
    else if (bytes.length > 8) break // payload ended (e.g. the emoji was pasted twice)
    else bytes.length = 0 // a lone VS16 inside a normal emoji: not a payload
  }
  if (bytes.length < 8) return null
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes))
  } catch {
    return null
  }
}

// Has hidden data? (cheap check before decoding)
export const hasHiddenData = (s) => /[\u{E0100}-\u{E01EF}]/u.test(String(s || ''))
