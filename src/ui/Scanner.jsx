import { useEffect, useRef, useState } from 'react'

// Pantalla completa con la cámara. Llama a onResult(texto) con el primer QR que lee.
// qr-scanner se carga recién acá, así no pesa en la carga inicial de la app.
export default function Scanner({ onResult, onClose, hint = 'Apuntá a un QR de Cashu o Lightning' }) {
  const video = useRef(null)
  const done = useRef(false)
  const scannerRef = useRef(null)
  const [err, setErr] = useState('')
  const [torch, setTorch] = useState(null) // null = sin linterna; true/false = estado

  useEffect(() => {
    let scanner
    let alive = true
    ;(async () => {
      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
          throw new Error('La cámara solo funciona en HTTPS (o localhost).')
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
            ? 'No me diste permiso para usar la cámara. Habilitalo en la configuración del navegador.'
            : /camera not found|NotFound|no camera/i.test(m)
              ? 'No encontré ninguna cámara en este dispositivo.'
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
    <div className="scanner" role="dialog" aria-label="Escanear QR">
      <video ref={video} muted playsInline />
      <div className="scan-frame" aria-hidden="true" />
      <div className="scan-top">
        <span className="scan-hint">{err ? '📷 Sin cámara' : hint}</span>
        <button className="icon-btn" onClick={onClose} aria-label="Cerrar">
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
          {torch ? '🔦 Apagar luz' : '🔦 Prender luz'}
        </button>
      )}
    </div>
  )
}
