// Finds a token / invoice / address inside an image file (GIF, PNG, JPG, screenshot…).
// 1. Bellota GIFs carry the token verbatim in a comment block: lossless and instant.
// 2. Otherwise read the QR code in the image (also works on re-encoded GIFs and screenshots).
import { classify } from './parse.js'

export async function readImage(file) {
  if (!file || !/^image\//.test(file.type || 'image/')) throw new Error("That file isn't an image")
  const buf = await file.arrayBuffer()
  for (const text of readGifComments(buf)) {
    const r = classify(text)
    if (r.kind !== 'unknown') return { ...r, via: 'gif' }
  }
  const { default: QrScanner } = await import('qr-scanner')
  let data
  try {
    // Scan at full resolution: by default the image is downscaled, which breaks dense token QRs.
    const img = await createImageBitmap(file)
    const full = { x: 0, y: 0, width: img.width, height: img.height, downScaledWidth: img.width, downScaledHeight: img.height }
    data = (await QrScanner.scanImage(img, { returnDetailedScanResult: true, scanRegion: full, alsoTryWithoutScanRegion: true })).data
  } catch {
    try {
      data = (await QrScanner.scanImage(file, { returnDetailedScanResult: true })).data
    } catch {
      throw new Error("Couldn't find a QR code or a Cashu token in that image")
    }
  }
  const r = classify(data)
  if (r.kind === 'unknown') throw new Error("The QR in that image isn't a Cashu token, invoice or address")
  return { ...r, via: 'qr' }
}


// Reads every Comment Extension in a GIF. Returns their text (or [] if not a GIF).
export function readGifComments(buf) {
  const b = new Uint8Array(buf)
  if (b.length < 13 || String.fromCharCode(...b.subarray(0, 3)) !== 'GIF') return []
  let p = 13
  if (b[10] & 0x80) p += 3 * (1 << ((b[10] & 7) + 1)) // global color table
  const out = []
  const readSubBlocks = () => {
    const parts = []
    while (p < b.length) {
      const len = b[p++]
      if (!len) break
      parts.push(b.subarray(p, p + len))
      p += len
    }
    const all = new Uint8Array(parts.reduce((s, x) => s + x.length, 0))
    let o = 0
    for (const x of parts) all.set(x, (o += x.length) - x.length)
    return all
  }
  while (p < b.length) {
    const block = b[p++]
    if (block === 0x3b) break // trailer
    if (block === 0x21) {
      const label = b[p++]
      const data = readSubBlocks()
      if (label === 0xfe) out.push(new TextDecoder().decode(data))
    } else if (block === 0x2c) {
      const flags = b[p + 8]
      p += 9
      if (flags & 0x80) p += 3 * (1 << ((flags & 7) + 1)) // local color table
      p++ // LZW minimum code size
      readSubBlocks()
    } else break // corrupt
  }
  return out
}
