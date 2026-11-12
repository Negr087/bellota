import { Suspense, useEffect, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Physics } from '@react-three/rapier'
import * as THREE from 'three'
import { JarColliders, JarGlass, JarLid, Table } from './Jar.jsx'
import { Coins } from './Coins.jsx'
import { Particles } from './Particles.jsx'
import { refreshTexturesWhenFontsReady } from './materials.js'

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

// Framing: on narrow screens (phones) pull the camera back so the jar fits
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

// Fires once the physics world (Rapier wasm) is up and a frame has been drawn with the coins in it.
// Lives inside the Physics <Suspense>, so it can't mount before the physics is ready.
function ReadySignal({ onReady }) {
  const sent = useRef(false)
  useFrame(() => {
    if (sent.current) return
    sent.current = true
    requestAnimationFrame(() => onReady?.())
  })
  return null
}

export default function Scene({ proofs, fx, amountOf, onPoke, onStage, theme, jar }) {
  const open = useLidOpen(fx)
  const controls = useRef()
  useEffect(refreshTexturesWhenFontsReady, [])
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 3.4, 9.6], fov: 38 }}
      gl={{ antialias: true, alpha: true }}
      onCreated={() => onStage?.('physics')}
    >
      <Framing controls={controls} />
      <ambientLight intensity={theme?.light.ambient ?? 1.4} />
      <directionalLight position={[4, 8, 5]} intensity={theme?.light.key ?? 2.2} />
      <directionalLight position={[-5, 3, -2]} intensity={0.6} color={theme?.light.fill ?? '#FFD9A8'} />
      <Particles kind={theme?.particles} />
      <Suspense fallback={null}>
        <Physics gravity={[0, -14, 0]} timeStep={1 / 60} interpolate>
          <JarColliders />
          <Coins proofs={proofs} fx={fx} amountOf={amountOf} />
          <ReadySignal onReady={() => onStage?.('ready')} />
        </Physics>
      </Suspense>
      <JarGlass onPoke={onPoke} {...jar} />
      <JarLid open={open} style={jar?.id} />
      <Table color={theme?.table} shadow={theme?.shadow} />
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
