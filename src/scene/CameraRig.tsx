import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type { PerspectiveCamera } from 'three'
import type { SessionSnapshot } from '../game/types'
import { pitchProgress } from './ballPath'
import {
  CAMERA_FOV,
  CAMERA_POSITION,
  CAMERA_PUSH_FOV,
  CAMERA_PUSH_Z,
  CAMERA_TARGET,
  clamp01,
  smoothstep,
} from './constants'

/** Contact kick: 120 ms, capped at 0.35 ft so the ball never gets harder to read. */
const KICK_MS = 120
const KICK_Y = 0.35
const KICK_ROLL = 0.008
/** Home-run nudge envelope (ms). */
const HR_IN_MS = 400
const HR_OUT_MS = 300
const HR_TARGET_Y = 9.0
const HR_FOV = 37

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * Deterministic camera choreography — idle drift, pitch push-in, contact kick
 * and the home-run nudge, all derived from `performance.now()` against snapshot
 * timestamps. No controls, no tweens, nothing to seek out of sync.
 * The kick and the nudge are gated behind `prefers-reduced-motion`; the push-in
 * stays because it is informational (the ball grows when timing matters).
 */
export function CameraRig({ snapshot }: { snapshot: SessionSnapshot }) {
  const calm = useMemo(() => prefersReducedMotion(), [])
  const lastFov = useRef(0)

  useFrame((state) => {
    const cam = state.camera as PerspectiveCamera
    const now = performance.now()
    const secs = now / 1000

    let x = CAMERA_POSITION[0]
    let y = CAMERA_POSITION[1]
    let z = CAMERA_POSITION[2]
    let fov = CAMERA_FOV
    let targetY = CAMERA_TARGET[1]
    let roll = 0

    // idle drift — always on, tiny
    x += Math.sin(secs * 0.11) * 0.22
    y += Math.sin(secs * 0.083 + 1.7) * 0.16

    // pitch push-in over t ∈ [0.55, 1.0]
    const t = pitchProgress(snapshot, now)
    if (t >= 0) {
      const k = smoothstep((t - 0.55) / 0.45)
      fov += (CAMERA_PUSH_FOV - CAMERA_FOV) * k
      z += (CAMERA_PUSH_Z - CAMERA_POSITION[2]) * k
    }

    const res = snapshot.lastResult
    if (res && !calm) {
      // contact kick
      const commitAt = res.commit?.atMs
      if (commitAt != null) {
        const k = (now - commitAt) / KICK_MS
        if (k >= 0 && k <= 1) {
          const s = Math.sin(Math.PI * k)
          y += s * KICK_Y
          roll = s * KICK_ROLL
        }
      }
      // home-run nudge: in 400 ms, hold, out 300 ms
      if (res.outcome.kind === 'homer') {
        const e = now - res.resolvedAtMs
        const holdEnd = Math.max(HR_IN_MS, res.outcome.flightMs - 300)
        let k = 0
        if (e >= 0 && e < HR_IN_MS) k = smoothstep(e / HR_IN_MS)
        else if (e >= HR_IN_MS && e < holdEnd) k = 1
        else if (e >= holdEnd && e < holdEnd + HR_OUT_MS) k = 1 - smoothstep((e - holdEnd) / HR_OUT_MS)
        if (k > 0) {
          targetY += (HR_TARGET_Y - CAMERA_TARGET[1]) * k
          fov += (HR_FOV - CAMERA_FOV) * clamp01(k)
        }
      }
    }

    cam.position.set(x, y, z)
    cam.lookAt(CAMERA_TARGET[0], targetY, CAMERA_TARGET[2])
    if (roll !== 0) cam.rotation.z += roll
    if (Math.abs(fov - lastFov.current) > 0.001) {
      cam.fov = fov
      cam.updateProjectionMatrix()
      lastFov.current = fov
    }
  })

  return null
}
