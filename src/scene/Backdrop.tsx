import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { BackSide, BufferAttribute, BufferGeometry, DoubleSide } from 'three'
import type { Group } from 'three'
import { COLORS, DEG, FENCE_LINE_FT, FOUL_DEG, fenceRadius } from './constants'
import { bleacherTexture, cloudTexture, skyGradientTexture } from './textures'
import { useGeneratedTexture } from './useGeneratedTexture'

/**
 * Gradient sky dome. Inward-facing sphere, unlit, unfogged, never depth-writing —
 * one draw call and ~2 KB of VRAM instead of drei's Preetham `<Sky>` shader.
 */
function SkyDome() {
  const map = useGeneratedTexture(skyGradientTexture, false)
  return (
    <mesh>
      <sphereGeometry args={[900, 24, 16]} />
      <meshBasicMaterial map={map} side={BackSide} depthWrite={false} fog={false} toneMapped={false} />
    </mesh>
  )
}

/** Two flat hill bands — depth plane 3, well behind the bleachers, eaten by fog. */
function Hills() {
  return (
    <group>
      <mesh position={[0, 33, 0]}>
        <cylinderGeometry args={[620, 620, 70, 40, 1, true]} />
        <meshBasicMaterial color={COLORS.hillBack} side={BackSide} />
      </mesh>
      <mesh position={[0, 20, 0]}>
        <cylinderGeometry args={[560, 560, 45, 40, 1, true]} />
        <meshBasicMaterial color={COLORS.hillFront} side={BackSide} />
      </mesh>
    </group>
  )
}

const BLEACHER_DEG = 60
const BLEACHER_GAP = 25
const BLEACHER_H = 26
const BLEACHER_TILT = 22 * DEG
const BLEACHER_SEGMENTS = 72

/** Inner radius of the stand: follows the wall arc in fair ground, then holds. */
function standRadius(deg: number): number {
  const a = Math.min(Math.abs(deg), FOUL_DEG)
  return fenceRadius(a) + BLEACHER_GAP
}

/** Bleacher ring: an arc band leaning back 22°, textured with rows + crowd speckle. */
function Bleachers() {
  const map = useGeneratedTexture(bleacherTexture)

  const geom = useMemo(() => {
    const pos: number[] = []
    const uv: number[] = []
    const dy = Math.cos(BLEACHER_TILT) * BLEACHER_H
    const dr = Math.sin(BLEACHER_TILT) * BLEACHER_H
    const pt = (deg: number, top: boolean) => {
      const r = standRadius(deg) + (top ? dr : 0)
      return [Math.sin(deg * DEG) * r, top ? dy : 0, -Math.cos(deg * DEG) * r]
    }
    for (let i = 0; i < BLEACHER_SEGMENTS; i++) {
      const k0 = i / BLEACHER_SEGMENTS
      const k1 = (i + 1) / BLEACHER_SEGMENTS
      const d0 = -BLEACHER_DEG + k0 * BLEACHER_DEG * 2
      const d1 = -BLEACHER_DEG + k1 * BLEACHER_DEG * 2
      const b0 = pt(d0, false)
      const b1 = pt(d1, false)
      const t0 = pt(d0, true)
      const t1 = pt(d1, true)
      pos.push(...b0, ...b1, ...t1)
      pos.push(...b0, ...t1, ...t0)
      const u0 = k0 * 10
      const u1 = k1 * 10
      uv.push(u0, 0, u1, 0, u1, 1)
      uv.push(u0, 0, u1, 1, u0, 1)
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
    g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
    g.computeVertexNormals()
    return g
  }, [])

  useEffect(() => () => geom.dispose(), [geom])

  return (
    <mesh geometry={geom}>
      <meshStandardMaterial map={map} roughness={0.95} side={DoubleSide} />
    </mesh>
  )
}

/** x0, y, z of the five cloud billboards. Never nearer than z = -450. */
const CLOUDS: [number, number, number][] = [
  [-235, 118, -640],
  [-70, 148, -730],
  [110, 102, -600],
  [255, 154, -780],
  [-360, 130, -800],
]

/** Flat cartoon clouds drifting on a deterministic sine — seek-safe by construction. */
function Clouds() {
  const map = useGeneratedTexture(cloudTexture)
  const group = useRef<Group>(null)

  useFrame(() => {
    const g = group.current
    if (!g) return
    const now = performance.now() / 1000
    for (let i = 0; i < g.children.length; i++) {
      g.children[i].position.x = CLOUDS[i][0] + Math.sin(now * 0.03 + i) * 12
    }
  })

  return (
    <group ref={group}>
      {CLOUDS.map((c) => (
        <mesh key={`${c[0]}:${c[2]}`} position={c}>
          <planeGeometry args={[92, 38]} />
          <meshBasicMaterial
            map={map}
            transparent
            depthWrite={false}
            fog={false}
            toneMapped={false}
            opacity={0.95}
          />
        </mesh>
      ))}
    </group>
  )
}

/**
 * Everything behind the wall, in three overlapping depth planes:
 * bleacher ring (fence + 25 ft) → hills (720 / 780 ft) → sky dome (900 ft),
 * with cloud billboards floating in between.
 */
export function Backdrop() {
  return (
    <group>
      <SkyDome />
      <Hills />
      <Clouds />
      <Bleachers />
    </group>
  )
}

/** Exported for `demo.md` / tests: where the stand starts down the line. */
export const BLEACHER_INNER_LINE_FT = FENCE_LINE_FT + BLEACHER_GAP
