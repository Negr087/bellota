// Background particles per theme: falling leaves, snow, or fireflies.
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { toonRamp } from './materials.js'

// Oak leaves falling in the background
function Leaves() {
  const ramp = toonRamp()
  const shape = useMemo(() => {
    const s = new THREE.Shape()
    s.moveTo(0, -0.5)
    s.bezierCurveTo(0.35, -0.3, 0.2, -0.1, 0.38, 0.05)
    s.bezierCurveTo(0.2, 0.15, 0.32, 0.3, 0.18, 0.45)
    s.bezierCurveTo(0.08, 0.4, 0.05, 0.5, 0, 0.6)
    s.bezierCurveTo(-0.05, 0.5, -0.08, 0.4, -0.18, 0.45)
    s.bezierCurveTo(-0.32, 0.3, -0.2, 0.15, -0.38, 0.05)
    s.bezierCurveTo(-0.2, -0.1, -0.35, -0.3, 0, -0.5)
    return s
  }, [])
  const leaves = useMemo(
    () =>
      Array.from({ length: 9 }, (_, i) => ({
        x: (i - 4) * 1.9 + Math.random(),
        z: -3 - Math.random() * 3,
        y: Math.random() * 10,
        speed: 0.35 + Math.random() * 0.4,
        sway: Math.random() * 6,
        color: ['#E9853A', '#F5A524', '#C9572B', '#9BBF4E'][i % 4],
        s: 0.7 + Math.random() * 0.6,
      })),
    [],
  )
  const refs = useRef([])
  useFrame((state, dt) => {
    const t = state.clock.elapsedTime
    leaves.forEach((l, i) => {
      const m = refs.current[i]
      if (!m) return
      l.y -= dt * l.speed
      if (l.y < -2) l.y = 9
      m.position.set(l.x + Math.sin(t * 0.8 + l.sway) * 0.6, l.y, l.z)
      m.rotation.set(Math.sin(t + l.sway) * 0.6, t * 0.3 + l.sway, Math.cos(t * 0.7 + l.sway) * 0.8)
    })
  })
  return leaves.map((l, i) => (
    <mesh key={i} ref={(m) => (refs.current[i] = m)} scale={l.s}>
      <shapeGeometry args={[shape]} />
      <meshToonMaterial color={l.color} gradientMap={ramp} side={THREE.DoubleSide} />
    </mesh>
  ))
}

// Snowflakes: one instanced mesh, so 70 flakes cost a single draw call.
function Snow() {
  const ref = useRef()
  const flakes = useMemo(
    () =>
      Array.from({ length: 70 }, () => ({
        x: (Math.random() - 0.5) * 18,
        y: Math.random() * 12 - 1,
        z: -7 + Math.random() * 8,
        speed: 0.45 + Math.random() * 0.6,
        sway: Math.random() * 6,
        s: 0.05 + Math.random() * 0.08,
      })),
    [],
  )
  const dummy = useMemo(() => new THREE.Object3D(), [])
  useFrame((state, dt) => {
    const m = ref.current
    if (!m) return
    const t = state.clock.elapsedTime
    flakes.forEach((f, i) => {
      f.y -= dt * f.speed
      if (f.y < -1.5) f.y = 11
      dummy.position.set(f.x + Math.sin(t * 0.6 + f.sway) * 0.4, f.y, f.z)
      dummy.scale.setScalar(f.s)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
    })
    m.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh ref={ref} args={[null, null, flakes.length]} frustumCulled={false}>
      <sphereGeometry args={[1, 8, 6]} />
      <meshBasicMaterial color="#FFFFFF" />
    </instancedMesh>
  )
}

// Fireflies: a bright core plus a soft additive glow, wandering and blinking.
function Fireflies() {
  const core = useRef()
  const glow = useRef()
  const flies = useMemo(
    () =>
      Array.from({ length: 26 }, () => ({
        x: (Math.random() - 0.5) * 14,
        y: Math.random() * 7 + 0.5,
        z: -6 + Math.random() * 6.5,
        p: Math.random() * 10,
        f: 0.4 + Math.random() * 0.6,
      })),
    [],
  )
  const dummy = useMemo(() => new THREE.Object3D(), [])
  useFrame((state) => {
    const t = state.clock.elapsedTime
    flies.forEach((f, i) => {
      const blink = 0.55 + 0.45 * Math.sin(t * 2.2 * f.f + f.p)
      dummy.position.set(f.x + Math.sin(t * 0.3 * f.f + f.p) * 1.2, f.y + Math.sin(t * 0.5 * f.f + f.p * 2) * 0.6, f.z + Math.cos(t * 0.25 + f.p) * 0.8)
      dummy.scale.setScalar(0.06 * blink)
      dummy.updateMatrix()
      core.current?.setMatrixAt(i, dummy.matrix)
      dummy.scale.setScalar(0.26 * blink)
      dummy.updateMatrix()
      glow.current?.setMatrixAt(i, dummy.matrix)
    })
    if (core.current) core.current.instanceMatrix.needsUpdate = true
    if (glow.current) glow.current.instanceMatrix.needsUpdate = true
  })
  return (
    <>
      <instancedMesh ref={core} args={[null, null, flies.length]} frustumCulled={false}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshBasicMaterial color="#FFF6B0" />
      </instancedMesh>
      <instancedMesh ref={glow} args={[null, null, flies.length]} frustumCulled={false}>
        <sphereGeometry args={[1, 12, 8]} />
        <meshBasicMaterial color="#FFE066" transparent opacity={0.22} depthWrite={false} blending={THREE.AdditiveBlending} />
      </instancedMesh>
    </>
  )
}

export function Particles({ kind }) {
  if (kind === 'leaves') return <Leaves />
  if (kind === 'snow') return <Snow />
  if (kind === 'fireflies') return <Fireflies />
  return null
}
