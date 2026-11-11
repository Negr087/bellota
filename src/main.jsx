import { createRoot } from 'react-dom/client'
import '@fontsource/fredoka/latin-500.css'
import '@fontsource/fredoka/latin-700.css'
import '@fontsource/space-grotesk/latin-400.css'
import '@fontsource/space-grotesk/latin-600.css'
import './styles.css'
import App from './App.jsx'
import { FORCE_DEMO } from './lib/useWallet.js'

// PWA: register the service worker (not in dev, and not in the single-file demo build).
if (import.meta.env.PROD && !FORCE_DEMO && 'serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}))
}

// The install prompt fires early, often before React mounts: keep it for the "Install app" button.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  window.__installPrompt = e
  window.dispatchEvent(new Event('bellota:installable'))
})

createRoot(document.getElementById('root')).render(<App />)
