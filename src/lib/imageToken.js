// Finds a token / invoice / address in the QR code of an image (screenshot, photo…).
import { classify } from './parse.js'

export async function readImage(file) {
  if (!file || !/^image\//.test(file.type || 'image/')) throw new Error("That file isn't an image")
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
  return r
}
