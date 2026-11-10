import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Physics } from '@react-three/rapier'
import * as THREE from 'three'
import { JarColliders, JarGlass, JarLid, Table } from './Jar.jsx'
import { Coins } from './Coins.jsx'
import { refreshTexturesWhenFontsReady, toonRamp } from './materials.js'

// Hojitas de roble que caen de fondo
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

function useLidOpen(fx) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (fx.kind !== 'pour' && fx.kind !== 'toss') return
    setOpen(true)
    const id = setTimeout(() => setOpen(false), fx.kind === 'pour' ? 2600 : 1700)
    return () => clearTimeout(id)
  }, [fx])
  return open
}

// Encuadre: en pantallas angostas (celular) alejamos la cámara para que entre el frasco
function Framing({ controls }) {
  const { camera, size } = useThree()
  useEffect(() => {
    const a = size.width / size.height
    const d = Math.max(11.5, 2.15 / (Math.tan(THREE.MathUtils.degToRad(19)) * a))
    const ty = a < 1 ? 2.35 : 2.15
    camera.position.set(0, ty + d * 0.17, d)
    camera.lookAt(0, ty, 0)
    if (controls.current) {
      controls.current.target.set(0, ty, 0)
      controls.current.update()
    }
  }, [camera, size, controls])
  return null
}

export default function Scene({ proofs, fx, amountOf, onPoke }) {
  const open = useLidOpen(fx)
  const controls = useRef()
  useEffect(refreshTexturesWhenFontsReady, [])
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 3.4, 9.6], fov: 38 }}
      gl={{ antialias: true, alpha: true }}
    >
      <Framing controls={controls} />
      <ambientLight intensity={1.4} />
      <directionalLight position={[4, 8, 5]} intensity={2.2} />
      <directionalLight position={[-5, 3, -2]} intensity={0.6} color="#FFD9A8" />
      <Leaves />
      <Suspense fallback={null}>
        <Physics gravity={[0, -14, 0]} timeStep="vary">
          <JarColliders />
          <Coins proofs={proofs} fx={fx} amountOf={amountOf} />
        </Physics>
      </Suspense>
      <JarGlass onPoke={onPoke} />
      <JarLid open={open} />
      <Table />
      <OrbitControls
        ref={controls}
        enablePan={false}
        enableZoom={false}
        minPolarAngle={Math.PI * 0.3}
        maxPolarAngle={Math.PI * 0.5}
        minAzimuthAngle={-0.7}
        maxAzimuthAngle={0.7}
        rotateSpeed={0.5}
      />
    </Canvas>
  )
}
