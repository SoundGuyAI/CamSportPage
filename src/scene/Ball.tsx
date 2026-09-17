import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Mesh } from 'three'
import type { SessionSnapshot } from '../game/types'
import { ballPose } from './ballPath'
import { COLORS, CONTACT_POINT } from './constants'

/**
 * Ball + timing ring. The frame callback closes over the latest snapshot and
 * writes transforms directly onto the meshes — no React state during flight.
 * Motion is purely a function of `performance.now()`, the same clock
 * GameSession stamps its timestamps with.
 */
export function Ball({ snapshot }: { snapshot: SessionSnapshot }) {
  const ball = useRef<Mesh>(null)
  const ring = useRef<Mesh>(null)

  useFrame(() => {
    const pose = ballPose(snapshot, performance.now())
    const b = ball.current
    if (b) {
      b.visible = pose.visible
      if (pose.visible) b.position.set(pose.x, pose.y, pose.z)
    }
    const r = ring.current
    if (r) {
      const active = pose.pitchT >= 0
      r.visible = active
      if (active) {
        // Shrinks from 3.2 ft to 0.8 ft as the ball reaches the plate.
        const s = 3.2 - 2.4 * pose.pitchT
        r.scale.setScalar(s)
      }
    }
  })

  return (
    <group>
      <mesh ref={ball} visible={false}>
        <sphereGeometry args={[0.36, 14, 10]} />
        <meshLambertMaterial color={COLORS.ball} emissive={COLORS.ball} emissiveIntensity={0.35} />
      </mesh>
      <mesh
        ref={ring}
        visible={false}
        position={[CONTACT_POINT[0], CONTACT_POINT[1], CONTACT_POINT[2]]}
        rotation={[0, 0, 0]}
      >
        <ringGeometry args={[0.82, 1, 32]} />
        <meshBasicMaterial color={COLORS.ring} transparent opacity={0.6} depthWrite={false} />
      </mesh>
    </group>
  )
}
