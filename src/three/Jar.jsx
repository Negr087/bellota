import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RigidBody, CuboidCollider } from '@react-three/rapier'
import * as THREE from 'three'
import { Hull, INK, toonRamp } from './materials.js'

export const JAR_R = 1.45 // usable inner radius
export const JAR_H = 2.9

// Invisible physics walls: a 28-sided ring, taller than the jar so nothing escapes while falling.
// Thick (0.6) walls and a thick floor so fast coins can't tunnel through in a single physics step.
const WALL_T = 0.3 // half thickness
const WALL_SIDES = 28
export function JarColliders() {
  const center = JAR_R + 0.02 + WALL_T // inner face sits just inside the glass
  const walls = useMemo(() => {
    const out = []
    for (let i = 0; i < WALL_SIDES; i++) {
      const a = (i / WALL_SIDES) * Math.PI * 2
      out.push({ a, pos: [Math.cos(a) * center, 4.4, Math.sin(a) * center] })
    }
    return out
  }, [center])
  // wide enough to overlap neighbours at the outer face, so there are no gaps between segments
  const half = Math.tan(Math.PI / WALL_SIDES) * (center + WALL_T) + 0.05
  return (
    <RigidBody type="fixed" colliders={false} friction={0.9}>
      <CuboidCollider args={[JAR_R + 1, 0.5, JAR_R + 1]} position={[0, -0.5, 0]} />
      {walls.map((w, i) => (
        <CuboidCollider key={i} args={[WALL_T, 4.5, half]} position={w.pos} rotation={[0, -w.a, 0]} />
      ))}
    </RigidBody>
  )
}

// Invisible lid, only while shaking: coins bounce off it instead of flying over the rim.
// (It can't stay on all the time: new coins pour in from above the jar.)
export function ShakeLid() {
  return (
    <RigidBody type="fixed" colliders={false} restitution={0.3}>
      <CuboidCollider args={[JAR_R + 1, 0.5, JAR_R + 1]} position={[0, JAR_H + 0.42, 0]} />
    </RigidBody>
  )
}

function leafTexture() {
  // "scale" pattern for the acorn cap
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#9A6334'
  ctx.fillRect(0, 0, 256, 256)
  ctx.strokeStyle = '#6E4220'
  ctx.lineWidth = 5
  for (let y = 0; y < 300; y += 26) {
    for (let x = (y / 26) % 2 ? 13 : 0; x < 280; x += 26) {
      ctx.beginPath()
      ctx.arc(x, y, 12, 0.15 * Math.PI, 0.85 * Math.PI)
      ctx.stroke()
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(4, 2)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function canvasTexture(w, h, draw, repeat) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d'))
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  if (repeat) t.repeat.set(...repeat)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

// 🌰 Acorn cap (the original lid)
function AcornCap() {
  const tex = useMemo(leafTexture, [])
  const ramp = toonRamp()
  return (
    <>
      <mesh scale={[1, 0.5, 1]} position={[0, 0.02, 0]}>
        <sphereGeometry args={[1.82, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshToonMaterial map={tex} gradientMap={ramp} />
        <Hull scale={[1.03, 1.06, 1.03]} />
      </mesh>
      <mesh position={[0, 0.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.8, 0.09, 12, 64]} />
        <meshToonMaterial color="#6E4220" gradientMap={ramp} />
        <Hull scale={[1.01, 1.01, 1.5]} />
      </mesh>
      {/* stem */}
      <mesh position={[0.12, 1.05, 0]} rotation={[0, 0, -0.35]}>
        <capsuleGeometry args={[0.13, 0.5, 6, 12]} />
        <meshToonMaterial color="#6E4220" gradientMap={ramp} />
        <Hull scale={[1.3, 1.1, 1.3]} />
      </mesh>
    </>
  )
}

// 🫙 Mason jar: metal screw band with ridges and a flat top
function MasonLid() {
  const ramp = toonRamp()
  return (
    <>
      <mesh position={[0, 0.1, 0]}>
        <cylinderGeometry args={[1.7, 1.7, 0.42, 64]} />
        <meshToonMaterial color="#C3CBD3" gradientMap={ramp} />
        <Hull scale={[1.02, 1.12, 1.02]} />
      </mesh>
      {[-0.03, 0.1, 0.23].map((y) => (
        <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.71, 0.025, 6, 64]} />
          <meshBasicMaterial color="#7D8893" />
        </mesh>
      ))}
      <mesh position={[0, 0.33, 0]}>
        <cylinderGeometry args={[1.5, 1.6, 0.06, 64]} />
        <meshToonMaterial color="#A9B3BD" gradientMap={ramp} />
      </mesh>
    </>
  )
}

// 🍯 Honey pot: gingham cloth cover tied with a string
function HoneyCloth() {
  const ramp = toonRamp()
  const tex = useMemo(
    () =>
      canvasTexture(
        128,
        128,
        (ctx) => {
          ctx.fillStyle = '#FFF7EC'
          ctx.fillRect(0, 0, 128, 128)
          ctx.fillStyle = 'rgba(222, 72, 58, .55)'
          for (let i = 0; i < 4; i++) {
            ctx.fillRect(i * 32, 0, 16, 128)
            ctx.fillRect(0, i * 32, 128, 16)
          }
        },
        [6, 3],
      ),
    [],
  )
  return (
    <>
      <mesh scale={[1, 0.38, 1]} position={[0, 0.02, 0]}>
        <sphereGeometry args={[1.84, 48, 20, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshToonMaterial map={tex} gradientMap={ramp} />
        <Hull scale={[1.03, 1.08, 1.03]} />
      </mesh>
      {/* the cloth hanging over the rim */}
      <mesh position={[0, -0.22, 0]}>
        <cylinderGeometry args={[1.84, 2.02, 0.5, 48, 1, true]} />
        <meshToonMaterial map={tex} gradientMap={ramp} side={THREE.DoubleSide} />
        <Hull scale={[1.02, 1.02, 1.02]} />
      </mesh>
      <mesh position={[0, -0.1, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.7, 0.06, 8, 64]} />
        <meshToonMaterial color="#C9572B" gradientMap={ramp} />
      </mesh>
      {/* bow */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.22, -0.08, 1.74]} rotation={[0, 0, side * 0.5]}>
          <torusGeometry args={[0.16, 0.05, 6, 16]} />
          <meshToonMaterial color="#C9572B" gradientMap={ramp} />
        </mesh>
      ))}
    </>
  )
}

// 🍾 Cork stopper
function Cork() {
  const ramp = toonRamp()
  const tex = useMemo(
    () =>
      canvasTexture(
        128,
        128,
        (ctx) => {
          ctx.fillStyle = '#D2A570'
          ctx.fillRect(0, 0, 128, 128)
          for (let i = 0; i < 220; i++) {
            ctx.fillStyle = Math.random() < 0.5 ? 'rgba(120, 78, 38, .45)' : 'rgba(250, 220, 170, .5)'
            ctx.beginPath()
            ctx.arc(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 2.5, 0, Math.PI * 2)
            ctx.fill()
          }
        },
        [3, 1],
      ),
    [],
  )
  return (
    <>
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[1.5, 1.4, 0.85, 48]} />
        <meshToonMaterial map={tex} gradientMap={ramp} />
        <Hull scale={[1.03, 1.06, 1.03]} />
      </mesh>
      <mesh position={[0, 0.73, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.42, 0.07, 8, 48]} />
        <meshToonMaterial color="#A97B47" gradientMap={ramp} />
      </mesh>
    </>
  )
}

const LIDS = { acorn: AcornCap, mason: MasonLid, honey: HoneyCloth, cork: Cork }

// The lid lifts and slides aside when coins come in or go out (same motion for every style)
export function JarLid({ open, style = 'acorn' }) {
  const ref = useRef()
  const Lid = LIDS[style] || AcornCap
  useFrame((_, dt) => {
    const g = ref.current
    if (!g) return
    const k = 1 - Math.exp(-dt * 7)
    const ty = open ? JAR_H + 0.75 : JAR_H + 0.12
    const tr = open ? 0.75 : 0
    const tx = open ? -2.1 : 0
    g.position.y += (ty - g.position.y) * k
    g.position.x += (tx - g.position.x) * k
    g.rotation.z += (tr - g.rotation.z) * k
  })
  return (
    <group ref={ref} position={[0, JAR_H + 0.12, 0]}>
      <Lid />
    </group>
  )
}

// Glass outlines: two ink strokes that always face the camera
function GlassEdges() {
  const ref = useRef()
  useFrame(({ camera }) => {
    if (ref.current) ref.current.rotation.y = Math.atan2(camera.position.x, camera.position.z)
  })
  return (
    <group ref={ref}>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (JAR_R + 0.13), JAR_H / 2, 0]}>
          <boxGeometry args={[0.07, JAR_H, 0.07]} />
          <meshBasicMaterial color={INK} />
        </mesh>
      ))}
    </group>
  )
}

export function JarGlass({ onPoke, glass = '#CDEFFF', glassOpacity = 0.28, rim = '#DDF4FF', bottom = '#A9DDF5' }) {
  const ramp = toonRamp()
  return (
    <group>
      {/* glass */}
      <mesh position={[0, JAR_H / 2, 0]} onPointerDown={onPoke} renderOrder={2}>
        <cylinderGeometry args={[JAR_R + 0.12, JAR_R + 0.12, JAR_H, 64, 1, true]} />
        <meshBasicMaterial color={glass} transparent opacity={glassOpacity} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <GlassEdges />
      {/* cartoon highlights */}
      {[
        [2.35, 0.2, 0.55],
        [2.6, 0.07, 0.45],
        [0.55, 0.06, 0.3],
      ].map(([start, len, op], i) => (
        <mesh key={i} position={[0, JAR_H / 2 + 0.1, 0]} renderOrder={3}>
          <cylinderGeometry args={[JAR_R + 0.14, JAR_R + 0.14, JAR_H * 0.75, 16, 1, true, start, len]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={op} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {/* top rim */}
      <mesh position={[0, JAR_H, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[JAR_R + 0.14, 0.1, 12, 64]} />
        <meshToonMaterial color={rim} gradientMap={ramp} />
        <Hull scale={[1.01, 1.01, 1.6]} />
      </mesh>
      {/* bottom */}
      <mesh position={[0, -0.12, 0]}>
        <cylinderGeometry args={[JAR_R + 0.14, JAR_R + 0.1, 0.24, 64]} />
        <meshToonMaterial color={bottom} gradientMap={ramp} />
        <Hull scale={[1.025, 1.3, 1.025]} />
      </mesh>
    </group>
  )
}

export function Table({ color = '#F2B872', shadow = '#B97A3D' }) {
  const ramp = toonRamp()
  return (
    <group position={[0, -0.24, 0]}>
      <mesh position={[0, -0.22, 0]}>
        <cylinderGeometry args={[3.3, 3.15, 0.42, 64]} />
        <meshToonMaterial color={color} gradientMap={ramp} />
        <Hull scale={[1.015, 1.25, 1.015]} />
      </mesh>
      {/* cartoon shadow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.25, 0.005, 0.2]}>
        <circleGeometry args={[1.85, 48]} />
        <meshBasicMaterial color={shadow} transparent opacity={0.55} />
      </mesh>
    </group>
  )
}
