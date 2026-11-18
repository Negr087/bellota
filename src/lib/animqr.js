// Animated QR codes (BC-UR fountain codes, the format cashu.me and other wallets use).
// A long token is cut into small "ur:bytes/…" frames shown in a loop; the scanner
// collects frames in any order (and can skip some) until it can rebuild the token.
// Loaded lazily: only when a token is too long for one QR, or the scanner sees a frame.
import { UR, UREncoder, URDecoder } from '@gandlaf21/bc-ur'
import { Buffer } from 'buffer'

export const isUR = (s) => /^ur:/i.test(String(s || '').trim())

// Frames for `text`. `fragment` = bytes per frame (smaller = easier to scan, more frames).
export function encodeParts(text, fragment = 150) {
  const enc = new UREncoder(UR.fromBuffer(Buffer.from(text, 'utf8')), fragment, 0)
  return {
    count: enc.fragmentsLength,
    next: () => enc.nextPart(),
    first(k) {
      const e = new UREncoder(UR.fromBuffer(Buffer.from(text, 'utf8')), fragment, 0)
      return Array.from({ length: k }, () => e.nextPart())
    },
  }
}

// Collects frames. add() returns the rebuilt text once complete, else null.
export function makeDecoder() {
  let dec = new URDecoder()
  return {
    add(part) {
      try {
        dec.receivePart(String(part).trim().toLowerCase())
      } catch {
        return null // not a frame of ours / corrupted read: ignore it
      }
      if (!dec.isComplete()) return null
      const ok = dec.isSuccess()
      const out = ok ? Buffer.from(dec.resultUR().decodeCBOR()).toString('utf8') : null
      dec = new URDecoder()
      return out
    },
    progress: () => {
      try {
        return dec.estimatedPercentComplete()
      } catch {
        return 0
      }
    },
  }
}
