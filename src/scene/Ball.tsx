import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, BackSide, Color, Object3D } from 'three'
import type { Group, InstancedMesh, Mesh, MeshBasicMaterial, Sprite } from 'three'
import type { SessionSnapshot } from '../game/types'
import { ballPose, pitchProgress } from './ballPath'
import {
  COLORS,
  CONTACT_POINT,
  PERFECT_T_MAX,
  PERFECT_T_MIN,
  clamp01,
} from './constants'
import { ballSeamTexture, softDiscTexture } from './textures'
import { useGeneratedTexture } from './useGeneratedTexture'

/** Trail: 8 fading spheres sampled back along the (pure) ball path. */
const TRAIL_COUNT = 8
/** Sample spacing while the pitch is in flight / after contact (longer ribbon). */
const TRAIL_STEP_PITCH_MS = 26
const TRAIL_STEP_HIT_MS = 45

const BALL_R = 0.36
const SHELL_R = 0.42

// Reused per-frame scratch — nothing is allocated inside useFrame.
const scratchColor = new Color()
const farColor = new Color(COLORS.ringFar)
const nearColor = new Color(COLORS.ringNear)
const perfectColor = new Color(COLORS.ringPerfect)

/** Ring line weight: thicker on phones, where the ring is only ~60 px across. */
function ringInnerRadius(): number {
  const wide = typeof window !== 'undefined' && window.innerWidth >= 900
  return wide ? 0.82 : 0.74
}

function BallTrail({ snapshot }: { snapshot: SessionSnapshot }) {
  const mesh = useRef<InstancedMesh>(null)
  const dummy = useMemo(() => new Object3D(), [])

  useEffect(() => {
    const m = mesh.current
    if (!m) return
    for (let i = 0; i < TRAIL_COUNT; i++) {
      const k = 0.4 * (1 - i / TRAIL_COUNT)
      scratchColor.setRGB(k, k, k * 0.96)
      m.setColorAt(i, scratchColor)
    }
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [])

  useFrame(() => {
    const m = mesh.current
    if (!m) return
    const now = performance.now()
    const live = snapshot.phase === 'pitching' || snapshot.phase === 'result'
    const step = snapshot.phase === 'pitching' ? TRAIL_STEP_PITCH_MS : TRAIL_STEP_HIT_MS
    m.visible = live
    if (!live) return
    for (let i = 0; i < TRAIL_COUNT; i++) {
      const pose = ballPose(snapshot, now - (i + 1) * step)
      if (pose.visible) {
        dummy.position.set(pose.x, pose.y, pose.z)
        dummy.scale.setScalar(Math.pow(0.88, i + 1))
      } else {
        dummy.scale.setScalar(0)
      }
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
    }
    m.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, TRAIL_COUNT]} frustumCulled={false}>
      <sphereGeometry args={[BALL_R, 10, 8]} />
      <meshBasicMaterial
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        toneMapped={false}
      />
    </instancedMesh>
  )
}

/**
 * Ball + timing ring. The frame callback closes over the latest snapshot and
 * writes transforms directly onto the meshes — no React state during flight.
 * Motion is purely a function of `performance.now()`, the same clock
 * GameSession stamps its timestamps with.
 */
export function Ball({ snapshot }: { snapshot: SessionSnapshot }) {
  const ball = useRef<Group>(null)
  const rings = useRef<Group>(null)
  const outer = useRef<Mesh>(null)
  const outerMat = useRef<MeshBasicMaterial>(null)
  const glow = useRef<Sprite>(null)

  const seam = useGeneratedTexture(ballSeamTexture)
  const disc = useGeneratedTexture(softDiscTexture)
  const innerR = useMemo(() => ringInnerRadius(), [])

  useFrame((state) => {
    const now = performance.now()
    const pose = ballPose(snapshot, now)
    const t = pitchProgress(snapshot, now)

    const b = ball.current
    if (b) {
      b.visible = pose.visible
      if (pose.visible) {
        b.position.set(pose.x, pose.y, pose.z)
        // Wii-Sports scale cheat: the ball over-scales slightly on approach.
        b.scale.setScalar(t >= 0 ? 1 + 0.28 * clamp01(t) : 1)
      }
    }

    const g = rings.current
    if (!g) return
    const active = t >= 0
    g.visible = active
    if (!active) return
    g.lookAt(state.camera.position)

    const o = outer.current
    const om = outerMat.current
    if (o) o.scale.setScalar(3.4 - 2.45 * Math.min(t, 1.038))
    if (om) {
      if (t >= PERFECT_T_MIN && t <= PERFECT_T_MAX) {
        scratchColor.copy(perfectColor)
      } else if (t < 0.8) {
        scratchColor.copy(farColor)
      } else if (t < 0.96) {
        scratchColor.copy(farColor).lerp(nearColor, (t - 0.8) / 0.16)
      } else {
        scratchColor.copy(nearColor)
      }
      om.color.copy(scratchColor)
      om.opacity = 0.45 + 0.4 * clamp01(t)
    }

    const gl = glow.current
    if (gl) {
      const ramp = t > PERFECT_T_MAX ? 0 : 0.7 * clamp01((t - 0.9) / 0.1)
      gl.visible = ramp > 0.001
      gl.material.opacity = ramp
      gl.scale.setScalar(3.4)
    }
  })

  return (
    <group>
      <BallTrail snapshot={snapshot} />

      <group ref={ball} visible={false}>
        {/* Cartoon outline shell: inside-out sphere, so the ball keeps a dark rim
            over both the pale sky and the green outfield. */}
        <mesh>
          <sphereGeometry args={[SHELL_R, 14, 10]} />
          <meshBasicMaterial color={COLORS.ballOutline} side={BackSide} toneMapped={false} />
        </mesh>
        <mesh castShadow={false}>
          <sphereGeometry args={[BALL_R, 18, 14]} />
          <meshStandardMaterial
            map={seam}
            emissiveMap={seam}
            emissive={'#ffffff'}
            emissiveIntensity={0.5}
            roughness={0.55}
            metalness={0}
          />
        </mesh>
      </group>

      <group ref={rings} visible={false} position={CONTACT_POINT}>
        {/* Static perfect zone at r = 0.95 ft — the shrinking ring lands inside it. */}
        <mesh>
          <ringGeometry args={[0.86, 0.99, 40]} />
          <meshBasicMaterial
            color={COLORS.ringPerfect}
            transparent
            opacity={0.35}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
        {/* Shrinking approach ring: cyan → amber → green inside the perfect window. */}
        <mesh ref={outer}>
          <ringGeometry args={[innerR, 1, 40]} />
          <meshBasicMaterial
            ref={outerMat}
            color={COLORS.ringFar}
            transparent
            opacity={0.45}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
        <sprite ref={glow} visible={false}>
          <spriteMaterial
            map={disc}
            color={COLORS.ringPerfect}
            transparent
            opacity={0}
            depthWrite={false}
            blending={AdditiveBlending}
            toneMapped={false}
          />
        </sprite>
      </group>
    </group>
  )
}
