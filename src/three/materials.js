import * as THREE from 'three'

export const INK = '#2B1D14'

// 3-tone ramp for "cel" shading (cartoon look)
let _ramp
export function toonRamp() {
  if (_ramp) return _ramp
  const data = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255])
  _ramp = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat)
  _ramp.minFilter = THREE.NearestFilter
  _ramp.magFilter = THREE.NearestFilter
  _ramp.needsUpdate = true
  return _ramp
}

import { tierOf } from '../lib/tiers.js'
export { tierOf }

// Coin radius by amount: more sats, bigger coin
export const coinRadius = (amount) => Math.min(0.72, 0.27 + 0.04 * Math.log2(Math.max(1, amount)))
export const COIN_HALF = 0.075

function fmt(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(n % 1000 ? 1 : 0) + 'k'
  return String(n)
}

function drawAcorn(ctx, cx, cy, s, fill) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(s, s)
  ctx.lineWidth = 7
  ctx.lineJoin = 'round'
  ctx.strokeStyle = INK
  // nut
  ctx.beginPath()
  ctx.moveTo(-34, -4)
  ctx.bezierCurveTo(-34, 30, -14, 52, 0, 56)
  ctx.bezierCurveTo(14, 52, 34, 30, 34, -4)
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  ctx.stroke()
  // shine
  ctx.beginPath()
  ctx.ellipse(-14, 14, 6, 14, 0.3, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,.55)'
  ctx.fill()
  // little cap
  ctx.beginPath()
  ctx.moveTo(-42, 0)
  ctx.bezierCurveTo(-42, -30, 42, -30, 42, 0)
  ctx.quadraticCurveTo(0, 10, -42, 0)
  ctx.fillStyle = '#8B5A2B'
  ctx.fill()
  ctx.stroke()
  // stem
  ctx.beginPath()
  ctx.moveTo(0, -22)
  ctx.quadraticCurveTo(4, -36, 12, -40)
  ctx.lineWidth = 8
  ctx.lineCap = 'round'
  ctx.stroke()
  ctx.restore()
}

const capCache = new Map()
export function capTexture(amount) {
  if (capCache.has(amount)) return capCache.get(amount)
  const t = tierOf(amount)
  const S = 256
  const c = document.createElement('canvas')
  c.width = c.height = S
  const ctx = c.getContext('2d')
  ctx.fillStyle = t.face
  ctx.fillRect(0, 0, S, S)
  // engraved ring
  ctx.beginPath()
  ctx.arc(S / 2, S / 2, S / 2 - 22, 0, Math.PI * 2)
  ctx.lineWidth = 8
  ctx.strokeStyle = t.rim
  ctx.stroke()
  // rim dots
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2
    ctx.beginPath()
    ctx.arc(S / 2 + Math.cos(a) * (S / 2 - 9), S / 2 + Math.sin(a) * (S / 2 - 9), 3.2, 0, Math.PI * 2)
    ctx.fillStyle = t.rim
    ctx.fill()
  }
  drawAcorn(ctx, S / 2, S / 2 - 30, 0.95, '#FFF4E0')
  ctx.font = '700 64px Fredoka, "Space Grotesk", system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineWidth = 10
  ctx.strokeStyle = '#FFF4E0'
  const label = fmt(amount)
  ctx.strokeText(label, S / 2, S / 2 + 62)
  ctx.fillStyle = INK
  ctx.fillText(label, S / 2, S / 2 + 62)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  capCache.set(amount, tex)
  return tex
}

const matCache = new Map()
export function coinMaterials(amount) {
  if (matCache.has(amount)) return matCache.get(amount)
  const t = tierOf(amount)
  const ramp = toonRamp()
  const side = new THREE.MeshToonMaterial({ color: t.rim, gradientMap: ramp })
  const cap = new THREE.MeshToonMaterial({ map: capTexture(amount), gradientMap: ramp })
  const mats = [side, cap, cap] // CylinderGeometry: [side, top cap, bottom cap]
  matCache.set(amount, mats)
  return mats
}

// Web fonts load later: regenerate the textures once they're ready
export function refreshTexturesWhenFontsReady() {
  if (!document.fonts?.ready) return
  document.fonts.ready.then(() => {
    for (const [amount, tex] of capCache) {
      const fresh = (capCache.delete(amount), capTexture(amount))
      tex.image = fresh.image
      tex.needsUpdate = true
      capCache.set(amount, tex)
    }
  })
}

// Cartoon outline ("inverted hull"): copies the parent's geometry,
// scales it up slightly and paints the back faces in ink.
import { useLayoutEffect, useRef, createElement } from 'react'
const hullMat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide })
const noRay = () => null
export function Hull({ scale = 1.04 }) {
  const ref = useRef()
  useLayoutEffect(() => {
    const m = ref.current
    if (m?.parent?.geometry) m.geometry = m.parent.geometry
  })
  return createElement('mesh', { ref, scale, material: hullMat, raycast: noRay })
}
