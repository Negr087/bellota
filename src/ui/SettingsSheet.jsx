import { Sheet, useInstall } from './kit.jsx'
import { THEMES, JARS } from '../lib/look.js'
import { FORCE_DEMO } from '../lib/useWallet.js'
import { canVibrate, preview, setFeedbackPrefs, useFeedbackPrefs } from '../lib/feedback.js'

function Toggle({ on, onChange, label, hint, disabled }) {
  return (
    <label className={`toggle${disabled ? ' disabled' : ''}`}>
      <span>
        <b>{label}</b>
        {hint && <small>{hint}</small>}
      </span>
      <input type="checkbox" role="switch" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <i aria-hidden="true" />
    </label>
  )
}

export default function SettingsSheet({ w, look, onClose, onIntro }) {
  const app = useInstall()
  const fb = useFeedbackPrefs()
  const vib = canVibrate()
  return (
    <Sheet title="Settings" emoji="⚙️" onClose={onClose}>
      <div className="stack">
        <h3>Theme</h3>
        <div className="look-grid" role="radiogroup" aria-label="Theme">
          {THEMES.map((t) => (
            <button
              key={t.id}
              role="radio"
              aria-checked={look.look.theme === t.id}
              className={`look-card${look.look.theme === t.id ? ' on' : ''}`}
              onClick={() => look.setLook({ theme: t.id })}
            >
              <span className="look-swatch" style={{ background: t.swatch }} />
              <b>{t.name}</b>
              <small>{t.hint}</small>
            </button>
          ))}
        </div>

        <h3>Jar</h3>
        <div className="look-grid jars" role="radiogroup" aria-label="Jar">
          {JARS.map((j) => (
            <button
              key={j.id}
              role="radio"
              aria-checked={look.look.jar === j.id}
              className={`look-card${look.look.jar === j.id ? ' on' : ''}`}
              onClick={() => look.setLook({ jar: j.id })}
            >
              <span className="look-icon" style={{ background: j.glass }}>
                {j.icon}
              </span>
              <b>{j.name}</b>
            </button>
          ))}
        </div>

        <h3>Sound & haptics</h3>
        <div className="toggles">
          <Toggle
            label="🔊 Sounds"
            hint="Coins clinking in the jar, a chime when sats arrive"
            on={fb.sound}
            onChange={(v) => {
              setFeedbackPrefs({ sound: v })
              if (v) preview()
            }}
          />
          <Toggle
            label="📳 Vibration"
            hint={vib ? 'A buzz when you receive, send or pay' : "This browser can't vibrate (iPhone Safari doesn't support it)"}
            on={fb.haptics && vib}
            disabled={!vib}
            onChange={(v) => {
              setFeedbackPrefs({ haptics: v })
              if (v) navigator.vibrate?.(30)
            }}
          />
        </div>

        <h3>Wallet mode</h3>
        {FORCE_DEMO ? (
          <p className="hint">This is the demo build: offline, with toy sats. Download the project to use real mints.</p>
        ) : (
          <div className="seg">
            <button className={w.mode === 'real' ? 'on' : ''} onClick={() => w.setMode('real')}>
              Real mints
            </button>
            <button className={w.mode === 'demo' ? 'on' : ''} onClick={() => w.setMode('demo')}>
              Demo (toy sats)
            </button>
          </div>
        )}

        <h3>App</h3>
        <div className="row small">
          <button className="btn" onClick={onIntro}>
            🌰 How it works
          </button>
          {app.canInstall && (
            <button className="btn primary" onClick={app.install}>
              📲 Install Bellota
            </button>
          )}
        </div>
        {app.ios && (
          <p className="hint">
            📲 To install: tap <b>Share</b> in Safari, then <b>Add to Home Screen</b>.
          </p>
        )}
      </div>
    </Sheet>
  )
}
