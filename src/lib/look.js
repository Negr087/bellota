// Appearance: background theme + jar style. No three.js here, so the 2D UI can use it freely.
import { useCallback, useEffect, useState } from 'react'

// `bg` and `ink` drive the CSS (see [data-theme] in styles.css); the rest drives the 3D scene.
export const THEMES = [
  {
    id: 'paper',
    name: 'Paper',
    hint: 'Clean and calm',
    swatch: 'radial-gradient(circle at 1px 1px, rgba(43,29,20,.18) 1.2px, transparent 0) 0 0/9px 9px, #fff4e0',
    meta: '#FFF4E0',
    particles: null,
    table: '#F2B872',
    shadow: '#C98E52',
    light: { ambient: 1.4, key: 2.2, fill: '#FFD9A8' },
  },
  {
    id: 'night',
    name: 'Night',
    hint: 'Stars and fireflies',
    swatch: 'radial-gradient(circle at 70% 30%, #fff 1px, transparent 2px), radial-gradient(circle at 30% 60%, #fff 1px, transparent 2px), linear-gradient(180deg, #27305c, #11152b)',
    meta: '#1B2142',
    particles: 'fireflies',
    table: '#9C6B45',
    shadow: '#3B2A22',
    light: { ambient: 1.05, key: 1.9, fill: '#8FA2FF' },
  },
  {
    id: 'snow',
    name: 'Snowfall',
    hint: 'Cozy winter',
    swatch: 'linear-gradient(180deg, #e9f3ff, #c9ddf5)',
    meta: '#E9F3FF',
    particles: 'snow',
    table: '#E7C29A',
    shadow: '#A9BCD6',
    light: { ambient: 1.45, key: 2.0, fill: '#CFE3FF' },
  },
  {
    id: 'orange',
    name: 'Orange pill',
    hint: 'Sunburst, very Bitcoin',
    swatch: 'repeating-conic-gradient(from 0deg at 50% 70%, #ffb347 0 10deg, #ff9a2e 10deg 20deg)',
    meta: '#FFA53D',
    particles: null,
    table: '#FFE1B0',
    shadow: '#C9752A',
    light: { ambient: 1.4, key: 2.2, fill: '#FFC27A' },
  },
  {
    id: 'autumn',
    name: 'Autumn',
    hint: 'Falling oak leaves',
    swatch: 'linear-gradient(180deg, #ffe9c7, #ffc98a)',
    meta: '#FFE9C7',
    particles: 'leaves',
    table: '#F2B872',
    shadow: '#B97A3D',
    light: { ambient: 1.4, key: 2.2, fill: '#FFD9A8' },
  },
]

// Every jar has the same shape (so the physics stay identical); lid and glass change.
export const JARS = [
  { id: 'acorn', name: 'Acorn cap', icon: '🌰', glass: '#CDEFFF', glassOpacity: 0.28, rim: '#DDF4FF', bottom: '#A9DDF5' },
  { id: 'mason', name: 'Mason jar', icon: '🫙', glass: '#D4F5E4', glassOpacity: 0.3, rim: '#E3FAEE', bottom: '#AEE3C8' },
  { id: 'honey', name: 'Honey pot', icon: '🍯', glass: '#FFD27A', glassOpacity: 0.3, rim: '#FFE2A6', bottom: '#F5B94A' },
  { id: 'cork', name: 'Cork bottle', icon: '🍾', glass: '#E6DDFF', glassOpacity: 0.26, rim: '#F0EBFF', bottom: '#C9B8FF' },
]

const KEY = 'bellota:look'
const DEFAULT = { theme: 'paper', jar: 'acorn' }

export function readLook() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}')
    return {
      theme: THEMES.some((t) => t.id === v.theme) ? v.theme : DEFAULT.theme,
      jar: JARS.some((j) => j.id === v.jar) ? v.jar : DEFAULT.jar,
    }
  } catch {
    return DEFAULT
  }
}

export function useLook() {
  const [look, setLookState] = useState(readLook)
  useEffect(() => {
    const t = THEMES.find((x) => x.id === look.theme)
    document.documentElement.dataset.theme = look.theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.meta)
  }, [look.theme])
  const setLook = useCallback((patch) => {
    setLookState((prev) => {
      const next = { ...prev, ...patch }
      try {
        localStorage.setItem(KEY, JSON.stringify(next))
      } catch {
        /* no storage: keep it for this session */
      }
      return next
    })
  }, [])
  return {
    look,
    setLook,
    theme: THEMES.find((t) => t.id === look.theme),
    jar: JARS.find((j) => j.id === look.jar),
  }
}
