import { useEffect, useRef, useState } from 'react'

// Full-screen camera view. Calls onResult(text) with the first QR code it reads.
// qr-scanner is only loaded here, so it doesn't weigh on the app's initial load.
export default function Scanner({ onResult, onClose, hint = 'Point at a Cashu or Lightning QR code' }) {
  const video = useRef(null)
  const done = useRef(false)
  const scannerRef = useRef(null)
  const [err, setErr] = useState('')
  const [torch, setTorch] = useState(null) // null = no torch; true/false = state

  useEffect(() => {
    let scanner
    let alive = true
    ;(async () => {
      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
          throw new Error('The camera only works over HTTPS (or localhost).')
        const { default: QrScanner } = await import('qr-scanner')
        if (!alive) return
        scanner = new QrScanner(
          video.current,
          (r) => {
            if (done.current || !r?.data) return
            done.current = true
            navigator.vibrate?.(40)
            scanner.stop()
            onResult(r.data)
          },
          { preferredCamera: 'environment', returnDetailedScanResult: true, maxScansPerSecond: 15 },
        )
        scannerRef.current = scanner
        await scanner.start()
        if (!alive) return scanner.stop()
        if (await scanner.hasFlash().catch(() => false)) setTorch(false)
      } catch (e) {
        if (!alive) return
        const m = String(e?.message || e)
        setErr(
          /permission|denied|NotAllowed/i.test(m)
            ? 'Camera permission was denied. Enable it in your browser settings.'
            : /camera not found|NotFound|no camera/i.test(m)
              ? 'No camera found on this device.'
              : m,
        )
      }
    })()
    const k = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => {
      alive = false
      window.removeEventListener('keydown', k)
      scanner?.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="scanner" role="dialog" aria-label="Scan QR">
      <video ref={video} muted playsInline />
      <div className="scan-frame" aria-hidden="true" />
      <div className="scan-top">
        <span className="scan-hint">{err ? '📷 No camera' : hint}</span>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      {err && <p className="scan-err">{err}</p>}
      {torch !== null && (
        <button
          className="btn scan-torch"
          onClick={async () => {
            try {
              await scannerRef.current?.toggleFlash()
              setTorch(scannerRef.current?.isFlashOn() ?? false)
            } catch {
              setTorch(null)
            }
          }}
        >
          {torch ? '🔦 Light off' : '🔦 Light on'}
        </button>
      )}
    </div>
  )
}
