import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { RigidBody, CylinderCollider } from '@react-three/rapier'
import * as THREE from 'three'
import { COIN_HALF, Hull, coinMaterials, coinRadius, tierOf } from './materials.js'
import { JAR_R } from './Jar.jsx'

const MAX_COINS = 160
const geoCache = new Map()
const coinGeo = (r) => {
  if (!geoCache.has(r)) geoCache.set(r, new THREE.CylinderGeometry(r, r, COIN_HALF * 2, 40))
  return geoCache.get(r)
}

const rand = (a, b) => a + Math.random() * (b - a)

function spawnPose(i, intro, r) {
  const maxR = JAR_R - r - 0.05
  const ang = Math.random() * Math.PI * 2
  const rad = Math.sqrt(Math.random()) * maxR * (intro ? 0.9 : 0.55)
  return {
    pos: [Math.cos(ang) * rad, intro ? 0.4 + i * 0.22 : 3.6 + i * 0.42, Math.sin(ang) * rad],
    rot: [rand(-1.2, 1.2), rand(0, 6.28), rand(-1.2, 1.2)],
  }
}

function LiveCoin({ item, bodies, onPick }) {
  const r = coinRadius(item.amount)
  const ref = useRef()
  useEffect(() => {
    bodies.current.set(item.key, ref)
    return () => bodies.current.delete(item.key)
  }, [item.key, bodies])
  return (
    <RigidBody
      ref={ref}
      colliders={false}
      position={item.pose.pos}
      rotation={item.pose.rot}
      angularVelocity={[rand(-4, 4), rand(-4, 4), rand(-4, 4)]}
      linearVelocity={[0, item.intro ? 0 : -2, 0]}
      restitution={0.25}
      friction={0.7}
      linearDamping={0.15}
      angularDamping={0.35}
      ccd
    >
      <CylinderCollider args={[COIN_HALF, r]} />
      <mesh
        geometry={coinGeo(r)}
        material={coinMaterials(item.amount)}
        onPointerDown={(e) => {
          e.stopPropagation()
          onPick(item.key)
        }}
      >
        <Hull scale={[1 + 0.045 / r, 1.45, 1 + 0.045 / r]} />
      </mesh>
    </RigidBody>
  )
}

// Moneda que se va: "toss" = sale volando por arriba (envío ecash), "melt" = se derrite en un rayo (pago LN)
function LeavingCoin({ item, onDone }) {
  const ref = useRef()
  const t0 = useRef(null)
  const r = coinRadius(item.amount)
  const delay = item.delay
  const mats = useMemo(() => {
    const base = coinMaterials(item.amount)
    return base.map((m) => {
      const c = m.clone()
      c.transparent = true
      return c
    })
  }, [item.amount])
  const from = item.from
  const to = useMemo(
    () => (item.kind === 'melt' ? null : new THREE.Vector3(from.x * 0.4 + rand(-2.5, 2.5), 8.5, rand(1.5, 3.5))),
    [item.kind, from],
  )
  useFrame((state, dt) => {
    const m = ref.current
    if (!m) return
    if (t0.current == null) t0.current = state.clock.elapsedTime + delay
    const t = (state.clock.elapsedTime - t0.current) / 1.1
    if (t < 0) return
    if (t >= 1) {
      if (!m.userData.done) onDone(item.key)
      m.userData.done = true
      m.visible = false
      return
    }
    if (item.kind === 'melt') {
      const s = 1 - t
      m.scale.set(1 + t * 0.6, Math.max(0.05, s * s), 1 + t * 0.6)
      m.position.set(from.x, from.y - t * 0.1, from.z)
      m.rotation.y += dt * 8
      mats.forEach((mm) => {
        mm.opacity = 1 - t
        mm.color.setRGB(1, 1 - t * 0.2, 1 - t * 0.9)
      })
    } else {
      const e = t * t * (3 - 2 * t)
      m.position.set(
        THREE.MathUtils.lerp(from.x, to.x, e),
        THREE.MathUtils.lerp(from.y, to.y, e) + Math.sin(t * Math.PI) * 1.5,
        THREE.MathUtils.lerp(from.z, to.z, e),
      )
      m.rotation.x += dt * 9
      m.rotation.z += dt * 4
      const s = 1 - t * 0.5
      m.scale.setScalar(s)
      mats.forEach((mm) => (mm.opacity = t > 0.75 ? (1 - t) * 4 : 1))
    }
  })
  return (
    <mesh ref={ref} geometry={coinGeo(r)} material={mats} position={[from.x, from.y, from.z]} quaternion={item.quat}>
      <Hull scale={[1 + 0.045 / r, 1.45, 1 + 0.045 / r]} />
    </mesh>
  )
}

function Bolt({ at, onDone }) {
  const ref = useRef()
  const t0 = useRef(null)
  const shape = useMemo(() => {
    const s = new THREE.Shape()
    const p = [
      [0.1, 0.9], [-0.45, 0], [-0.05, 0], [-0.2, -0.9], [0.45, 0.1], [0.05, 0.1],
    ]
    s.moveTo(...p[0])
    p.slice(1).forEach((q) => s.lineTo(...q))
    s.closePath()
    return s
  }, [])
  useFrame((state) => {
    if (!ref.current) return
    if (t0.current == null) t0.current = state.clock.elapsedTime
    const t = (state.clock.elapsedTime - t0.current) / 1.4
    if (t >= 1) {
      if (!ref.current.userData.done) onDone()
      ref.current.userData.done = true
      ref.current.visible = false
      return
    }
    ref.current.position.set(at[0], at[1] + t * 3.2, at[2])
    ref.current.scale.setScalar(Math.sin(Math.min(1, t * 2.2) * Math.PI * 0.5) * (1 - t * 0.3))
    ref.current.rotation.y = Math.sin(t * 10) * 0.4
  })
  return (
    <mesh ref={ref} position={at} scale={0.01}>
      <extrudeGeometry args={[shape, { depth: 0.15, bevelEnabled: false }]} />
      <meshToonMaterial color="#FFD23F" />
      <Hull scale={[1.12, 1.08, 1.4]} />
    </mesh>
  )
}

export function Coins({ proofs, fx, amountOf }) {
  const bodies = useRef(new Map())
  const [items, setItems] = useState([]) // {key, amount, state:'live'|'leaving', ...}
  const [picked, setPicked] = useState(null)
  const [bolts, setBolts] = useState([])
  const first = useRef(true)
  const fxRef = useRef(fx)
  fxRef.current = fx
  const tip = useRef()

  const wanted = useMemo(() => {
    const list = proofs.map((p) => ({ key: p.secret, amount: amountOf(p.amount) }))
    if (list.length <= MAX_COINS) return list
    return [...list].sort((a, b) => b.amount - a.amount).slice(0, MAX_COINS)
  }, [proofs, amountOf])

  useEffect(() => {
    const intro = first.current
    first.current = false
    setItems((prev) => {
      const wantedKeys = new Set(wanted.map((w) => w.key))
      const prevKeys = new Set(prev.map((p) => p.key))
      const kind = fxRef.current.kind === 'melt' ? 'melt' : 'toss'
      let leaveIdx = 0
      const next = prev.map((it) => {
        if (it.state === 'live' && !wantedKeys.has(it.key)) {
          const body = bodies.current.get(it.key)?.current
          const tr = body?.translation() ?? { x: 0, y: 1, z: 0 }
          const q = body?.rotation() ?? { x: 0, y: 0, z: 0, w: 1 }
          return {
            ...it,
            state: 'leaving',
            kind,
            from: new THREE.Vector3(tr.x, tr.y, tr.z),
            quat: new THREE.Quaternion(q.x, q.y, q.z, q.w),
            delay: leaveIdx++ * 0.07,
          }
        }
        return it
      })
      let i = 0
      for (const w of wanted) {
        if (prevKeys.has(w.key)) continue
        const pose = spawnPose(i++, intro, coinRadius(w.amount))
        next.push({ ...w, state: 'live', pose, intro })
      }
      if (leaveIdx && kind === 'melt') setBolts((b) => [...b, { id: Math.random(), at: [0, 1.8, 0.4] }])
      return next
    })
  }, [wanted])

  // Agitar el frasco
  useEffect(() => {
    if (fx.kind !== 'shake') return
    for (const ref of bodies.current.values()) {
      const b = ref.current
      if (!b) continue
      b.setLinvel({ x: rand(-2.5, 2.5), y: rand(5, 8), z: rand(-2.5, 2.5) }, true)
      b.setAngvel({ x: rand(-10, 10), y: rand(-10, 10), z: rand(-10, 10) }, true)
    }
  }, [fx])

  // Etiqueta flotante sobre la moneda tocada
  useFrame(() => {
    if (!picked || !tip.current) return
    const b = bodies.current.get(picked)?.current
    if (!b) return
    const t = b.translation()
    tip.current.position.set(t.x, t.y + 0.55, t.z)
  })
  useEffect(() => {
    if (!picked) return
    const id = setTimeout(() => setPicked(null), 2600)
    return () => clearTimeout(id)
  }, [picked])

  const pickedItem = items.find((i) => i.key === picked && i.state === 'live')
  const done = (key) => setItems((prev) => prev.filter((p) => p.key !== key))

  return (
    <group>
      {items.map((it) =>
        it.state === 'live' ? (
          <LiveCoin key={it.key} item={it} bodies={bodies} onPick={setPicked} />
        ) : (
          <LeavingCoin key={it.key} item={it} onDone={done} />
        ),
      )}
      {bolts.map((b) => (
        <Bolt key={b.id} at={b.at} onDone={() => setBolts((x) => x.filter((y) => y.id !== b.id))} />
      ))}
      {pickedItem && (
        <group ref={tip}>
          <Html center zIndexRange={[20, 10]} style={{ pointerEvents: 'none' }}>
            <div className="coin-tip" style={{ '--tier': tierOf(pickedItem.amount).face }}>
              <b>{pickedItem.amount.toLocaleString('es-AR')}</b> sat{pickedItem.amount === 1 ? '' : 's'}
              <small>bellota de {tierOf(pickedItem.amount).name}</small>
            </div>
          </Html>
        </group>
      )}
    </group>
  )
}
