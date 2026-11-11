// Cashu token → animated GIF, and back.
//
// The GIF carries the token twice:
//  1. As a QR code, drawn identically on every frame. It survives chat apps that re-encode
//     GIFs (WhatsApp, Telegram…), screenshots, and any wallet's camera can read it.
//  2. Verbatim in a GIF Comment Extension, so Bellota can import it losslessly when the
//     file arrives untouched.
// Like the token itself, this is hidden, not encrypted: whoever has the GIF can claim it.
import { GIFEncoder, quantize, applyPalette } from 'gifenc'
import QRCode from 'qrcode'
import { TIERS } from './tiers.js'

const MIN_W = 560
const MODULE_PX = 5 // ≥5 px per QR module so phone cameras and image decoders can read dense tokens
const INK = '#2B1D14'
const PAPER = '#FFFDF7'
const BG = '#FFE9C7'
const FRAMES = 14
const DELAY = 80 // ms

const ACORN_BODY = new Path2D('M15 27h34c0 15-8 27-17 27S15 42 15 27z')
const ACORN_CAP = new Path2D('M10 28c0-11 10-17 22-17s22 6 22 17c-8 3-36 3-44 0z')
const ACORN_STEM = new Path2D('M32 11c0-4 2-7 6-8')

function drawAcorn(ctx, x, y, size, face, rot) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot)
  ctx.scale(size / 64, size / 64)
  ctx.translate(-32, -32)
  ctx.lineWidth = 4
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.strokeStyle = INK
  ctx.fillStyle = face
  ctx.fill(ACORN_BODY)
  ctx.stroke(ACORN_BODY)
  ctx.fillStyle = '#8B5A2B'
  ctx.fill(ACORN_CAP)
  ctx.stroke(ACORN_CAP)
  ctx.stroke(ACORN_STEM)
  ctx.restore()
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export function qrFits(token) {
  try {
    QRCode.create(token, { errorCorrectionLevel: 'L' })
    return true
  } catch {
    return false
  }
}

// Builds the GIF. Returns a Blob (image/gif).
export async function tokenToGif(token, { amount, memo } = {}) {
  await document.fonts?.load('700 40px Fredoka').catch(() => {})
  const qr = QRCode.create(token, { errorCorrectionLevel: 'L' })
  const n = qr.modules.size
  const quiet = 4
  // Whole pixels per module (crisp edges); the canvas grows with the token instead of shrinking the QR.
  const px = Math.max(MODULE_PX, Math.floor(456 / (n + quiet * 2)))
  const qrSize = px * (n + quiet * 2)
  const W = Math.max(MIN_W, qrSize + 104)
  const H = qrSize + 292

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const cardY = 132
  const cardX = (W - qrSize) / 2

  const frames = []
  for (let f = 0; f < FRAMES; f++) {
    const t = f / FRAMES
    ctx.fillStyle = BG
    ctx.fillRect(0, 0, W, H)

    // Bouncing acorns along the top, one per tier color
    TIERS.forEach((tier, i) => {
      const phase = (t + i / TIERS.length) % 1
      const hop = Math.abs(Math.sin(phase * Math.PI))
      const x = 72 + i * ((W - 144) / (TIERS.length - 1))
      drawAcorn(ctx, x, 96 - hop * 46, 48 + i * 4, tier.face, Math.sin(phase * Math.PI * 2) * 0.25)
    })
    ctx.fillStyle = INK
    ctx.fillRect(40, 122, W - 80, 4) // the "ground" they bounce on

    // QR card (identical on every frame)
    ctx.fillStyle = INK
    roundRect(ctx, cardX - 6 + 6, cardY + 6, qrSize + 12, qrSize + 12, 22)
    ctx.fill()
    ctx.fillStyle = PAPER
    roundRect(ctx, cardX - 6, cardY, qrSize + 12, qrSize + 12, 22)
    ctx.fill()
    ctx.lineWidth = 4
    ctx.strokeStyle = INK
    ctx.stroke()
    ctx.fillStyle = '#000000'
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++)
        if (qr.modules.get(r, c)) ctx.fillRect(cardX + (c + quiet) * px, cardY + 6 + (r + quiet) * px, px, px)

    // Caption
    const textY = cardY + qrSize + 70
    ctx.textAlign = 'center'
    ctx.fillStyle = INK
    ctx.font = '700 44px Fredoka, "Space Grotesk", sans-serif'
    if (amount) ctx.fillText(`${Number(amount).toLocaleString('en-US')} sats`, W / 2, textY)
    ctx.font = '600 22px "Space Grotesk", sans-serif'
    const sub = memo ? `“${memo.slice(0, 40)}”` : 'Cashu ecash 🌰'
    ctx.fillText(sub, W / 2, textY + 36)
    ctx.font = '500 17px "Space Grotesk", sans-serif'
    ctx.globalAlpha = 0.65
    ctx.fillText('Scan with any Cashu wallet', W / 2, textY + 66)
    ctx.globalAlpha = 1

    frames.push(ctx.getImageData(0, 0, W, H).data)
  }

  // One shared palette (all frames use the same colors), with pure black/paper guaranteed for the QR.
  const palette = quantize(frames[0], 96)
  palette.push([0, 0, 0], [255, 253, 247])
  const gif = GIFEncoder()
  frames.forEach((rgba, i) => {
    gif.writeFrame(applyPalette(rgba, palette), W, H, { palette: i === 0 ? palette : undefined, delay: DELAY })
  })
  writeComment(gif.stream, token)
  gif.finish()
  return new Blob([gif.bytes()], { type: 'image/gif' })
}

// GIF Comment Extension: 0x21 0xFE, then sub-blocks of ≤255 bytes, then 0x00.
function writeComment(stream, text) {
  const bytes = new TextEncoder().encode(text)
  stream.writeByte(0x21)
  stream.writeByte(0xfe)
  for (let i = 0; i < bytes.length; i += 255) {
    const chunk = bytes.subarray(i, i + 255)
    stream.writeByte(chunk.length)
    stream.writeBytes(chunk)
  }
  stream.writeByte(0)
}
