import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { AdditiveBlending, Color, Object3D } from 'three'
import type { Group, InstancedMesh, Mesh, MeshBasicMaterial, Sprite } from 'three'
import type { SessionSnapshot } from '../game/types'
import { COLORS, CONTACT_POINT, DEG, hash01 } from './constants'
import { softDiscTexture, starTexture } from './textures'
import { useGeneratedTexture } from './useGeneratedTexture'

/** Contact burst window (ms from `commit.atMs`). */
const BURST_MS = 240
/** Landing puff window (ms from `resolvedAtMs + flightMs`). */
const PUFF_MS = 420
/** Home-run fireworks: fixed stagger + duration, so replays match exactly. */
const FIREWORK_DELAYS = [200, 380, 560]
const FIREWORK_MS = 520
const FIREWORK_POS: [number, number, number][] = [
  [-90, 70, -390],
  [10, 95, -405],
  [95, 65, -380],
]
const FIREWORK_TINTS = [COLORS.wallRail, COLORS.ringPerfect, COLORS.ringFar]

const CHEVRONS = 10
const chevronDummy = new Object3D()
const puffColor = new Color()
const clayPuff = new Color('#E0C79A')
const grassPuff = new Color('#CFE6B8')

/**
 * All the one-shot hit juice: contact star + chevrons, landing puff and the
 * home-run fireworks. Every effect is a pure function of a snapshot timestamp,
 * so scrubbing to any moment reproduces the same frame.
 */
export function Impact({ snapshot }: { snapshot: SessionSnapshot }) {
  const star = useRef<Sprite>(null)
  const burst = useRef<Group>(null)
  const chevrons = useRef<InstancedMesh>(null)
  const puff = useRef<Mesh>(null)
  const fireworks = useRef<Group>(null)

  const disc = useGeneratedTexture(softDiscTexture)
  const starMap = useGeneratedTexture(starTexture)

  // Hashed chevron angles: stable per pitch index, no Math.random.
  const pitchIndex = snapshot.lastResult?.pitchIndex ?? 0
  const angles = useMemo(() => {
    const out = new Float32Array(CHEVRONS)
    for (let i = 0; i < CHEVRONS; i++) {
      out[i] = hash01(pitchIndex * 101 + i * 7) * Math.PI * 2
    }
    return out
  }, [pitchIndex])

  useFrame((state) => {
    const now = performance.now()
    const res = snapshot.lastResult

    // ---- contact burst -----------------------------------------------------
    const commitAt = res?.commit?.atMs ?? null
    const contact = commitAt != null && res != null && res.outcome.kind !== 'whiff'
    const bk = contact ? (now - (commitAt as number)) / BURST_MS : 2
    const bursting = bk >= 0 && bk <= 1

    const bg = burst.current
    if (bg) {
      bg.visible = bursting
      if (bursting) bg.lookAt(state.camera.position)
    }
    const s = star.current
    if (s && bursting) {
      const size = 0.6 + 6.4 * bk
      s.scale.set(size, size, 1)
      s.material.opacity = 1 - bk * bk
    }
    const ch = chevrons.current
    if (ch && bursting) {
      const dist = 1.5 + 3.5 * bk
      const fade = 1 - bk
      for (let i = 0; i < CHEVRONS; i++) {
        const a = angles[i]
        chevronDummy.position.set(Math.cos(a) * dist, Math.sin(a) * dist, 0)
        chevronDummy.rotation.set(0, 0, a)
        chevronDummy.scale.set(fade, 1, 1)
        chevronDummy.updateMatrix()
        ch.setMatrixAt(i, chevronDummy.matrix)
      }
      ch.instanceMatrix.needsUpdate = true
      const chMat = ch.material as MeshBasicMaterial
      chMat.opacity = fade
    }

    // ---- landing puff ------------------------------------------------------
    const p = puff.current
    if (p) {
      let show = false
      if (res && res.outcome.kind !== 'whiff' && res.outcome.distanceFt > 0) {
        const k = (now - (res.resolvedAtMs + res.outcome.flightMs)) / PUFF_MS
        if (k >= 0 && k <= 1) {
          show = true
          const heading = res.outcome.dirDeg * DEG
          const d = res.outcome.distanceFt
          p.position.set(Math.sin(heading) * d, 0.08, CONTACT_POINT[2] - Math.cos(heading) * d)
          const size = 1 + 8 * k
          p.scale.set(size, size, 1)
          const mat = p.material as MeshBasicMaterial
          mat.opacity = 0.55 * (1 - k)
          puffColor.copy(d < 95 ? clayPuff : grassPuff)
          mat.color.copy(puffColor)
        }
      }
      p.visible = show
    }

    // ---- home-run fireworks -----------------------------------------------
    const fw = fireworks.current
    if (fw) {
      const homer = res != null && res.outcome.kind === 'homer'
      fw.visible = homer
      if (homer && res) {
        for (let i = 0; i < FIREWORK_DELAYS.length; i++) {
          const sprite = fw.children[i] as Sprite
          const k = (now - (res.resolvedAtMs + FIREWORK_DELAYS[i])) / FIREWORK_MS
          const on = k >= 0 && k <= 1
          sprite.visible = on
          if (on) {
            const size = 0.5 + 13.5 * k
            sprite.scale.set(size, size, 1)
            sprite.material.opacity = 1 - k
          }
        }
      }
    }
  })

  return (
    <group>
      {/* Contact burst, billboarded to the camera at the contact point. */}
      <group ref={burst} visible={false} position={CONTACT_POINT}>
        <sprite ref={star}>
          <spriteMaterial
            map={starMap}
            color={'#FFF3C4'}
            transparent
            opacity={0}
            depthWrite={false}
            blending={AdditiveBlending}
            toneMapped={false}
          />
        </sprite>
        <instancedMesh args={[undefined, undefined, CHEVRONS]} ref={chevrons} frustumCulled={false}>
          <boxGeometry args={[1.6, 0.12, 0.12]} />
          <meshBasicMaterial
            color={COLORS.ringNear}
            transparent
            opacity={0}
            depthWrite={false}
            blending={AdditiveBlending}
            toneMapped={false}
          />
        </instancedMesh>
      </group>

      {/* Landing puff, flat on the ground at the landing spot. */}
      <mesh ref={puff} visible={false} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          map={disc}
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* Three fixed-position fireworks above the wall. */}
      <group ref={fireworks} visible={false}>
        {FIREWORK_POS.map((pos, i) => (
          <sprite key={`${pos[0]}`} position={pos} visible={false}>
            <spriteMaterial
              map={disc}
              color={FIREWORK_TINTS[i]}
              transparent
              opacity={0}
              depthWrite={false}
              blending={AdditiveBlending}
              toneMapped={false}
            />
          </sprite>
        ))}
      </group>
    </group>
  )
}
