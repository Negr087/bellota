// Optional sound effects and haptics.
// Sounds are synthesized with Web Audio (no audio files): coin clinks come from real physics
// collisions, plus short cues for receive / send / pay. Haptics use navigator.vibrate
// (Android browsers; iOS Safari has no vibration API, so it's silently skipped there).
import { useSyncExternalStore } from 'react'

const KEY = 'bellota:feedback'
const DEFAULTS = { sound: false, haptics: true }

let prefs = (() => {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }
  } catch {
    return { ...DEFAULTS }
  }
})()
const listeners = new Set()

export function setFeedbackPrefs(patch) {
  prefs = { ...prefs, ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    /* no storage */
  }
  if (patch.sound) unlock() // the toggle tap is the user gesture browsers require for audio
  listeners.forEach((l) => l())
}
const subscribe = (l) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
export const useFeedbackPrefs = () => useSyncExternalStore(subscribe, () => prefs)
export const canVibrate = () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'

// ---------- audio ----------
let ctx = null
let master = null
function audio() {
  if (!prefs.sound) return null
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = 0.5
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}
function unlock() {
  const c = audio()
  if (!c) return
  // a silent blip, so iOS fully unlocks the context inside the gesture
  const o = c.createOscillator()
  const g = c.createGain()
  g.gain.value = 0
  o.connect(g).connect(master)
  o.start()
  o.stop(c.currentTime + 0.01)
}

function tone({ freq, to, type = 'sine', at = 0, dur = 0.15, vol = 0.3, attack = 0.004 }) {
  const c = audio()
  if (!c) return
  const t = c.currentTime + at
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur)
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(vol, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(master)
  o.start(t)
  o.stop(t + dur + 0.02)
}

function noise({ at = 0, dur = 0.35, from = 400, to = 3000, vol = 0.25 }) {
  const c = audio()
  if (!c) return
  const t = c.currentTime + at
  const len = Math.ceil(c.sampleRate * dur)
  const buf = c.createBuffer(1, len, c.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  const src = c.createBufferSource()
  src.buffer = buf
  const f = c.createBiquadFilter()
  f.type = 'bandpass'
  f.Q.value = 1.2
  f.frequency.setValueAtTime(from, t)
  f.frequency.exponentialRampToValueAtTime(to, t + dur)
  const g = c.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(vol, t + dur * 0.3)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(f).connect(g).connect(master)
  src.start(t)
}

// Coin hitting glass / another coin. `strength` 0..1 from impact speed, `size` = coin radius.
let lastClink = 0
let recent = 0
export function clink(strength, size = 0.4) {
  if (!prefs.sound || !ctx || strength < 0.08) return // never create the context from physics alone
  const now = performance.now()
  if (now - lastClink < 28) return // rate limit: a shaken jar can collide hundreds of times a second
  recent = now - lastClink > 400 ? 0 : recent + 1
  if (recent > 18) return
  lastClink = now
  const base = 3400 - size * 2600 + Math.random() * 500 // bigger coin, lower pitch
  const vol = Math.min(0.32, 0.05 + strength * 0.3)
  tone({ freq: base, type: 'sine', dur: 0.09 + strength * 0.12, vol })
  tone({ freq: base * 2.76, type: 'sine', dur: 0.05, vol: vol * 0.35 }) // metallic overtone
}

const buzz = (pattern) => {
  if (prefs.haptics && canVibrate()) {
    try {
      navigator.vibrate(pattern)
    } catch {
      /* not allowed before a user gesture */
    }
  }
}

// High-level cues, driven by the wallet's fx events.
export function cue(kind) {
  switch (kind) {
    case 'pour': // sats received
      tone({ freq: 880, at: 0, dur: 0.18, vol: 0.18, type: 'triangle' })
      tone({ freq: 1320, at: 0.09, dur: 0.22, vol: 0.18, type: 'triangle' })
      tone({ freq: 1760, at: 0.18, dur: 0.3, vol: 0.14, type: 'triangle' })
      buzz([30, 50, 30, 50, 70])
      break
    case 'toss': // ecash sent
      noise({ dur: 0.38, from: 500, to: 4200, vol: 0.22 })
      buzz(25)
      break
    case 'melt': // Lightning payment
      tone({ freq: 1400, to: 90, type: 'sawtooth', dur: 0.32, vol: 0.12 })
      noise({ at: 0.02, dur: 0.18, from: 2500, to: 600, vol: 0.12 })
      buzz([15, 30, 15, 30, 40])
      break
    case 'shake':
      audio() // a gesture: make sure the context is running so the clinks are heard
      buzz(12)
      break
    default:
  }
}

// Browsers only start audio inside a user gesture: unlock on the first touch/click of the session.
if (typeof window !== 'undefined') {
  const first = () => {
    if (prefs.sound) unlock()
    window.removeEventListener('pointerdown', first, true)
  }
  window.addEventListener('pointerdown', first, true)
}

// Preview for the settings toggle
export const preview = () => cue('pour')
