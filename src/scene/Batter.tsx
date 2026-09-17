import { useFrame } from '@react-three/fiber'
import { Suspense, useRef } from 'react'
import type { Group } from 'three'
import {
  BAT_REST_X,
  BAT_REST_Y,
  BAT_SWING_X,
  COLORS,
  FIGURE_HEIGHT,
  SWING_ARC,
  SWING_MS,
  SWING_RETURN_MS,
} from './constants'
import { GlbFigure, ModelErrorBoundary } from './GlbFigure'
import { StylizedFigure } from './StylizedFigure'

const smoothstep = (x: number) => x * x * (3 - 2 * x)

/** Bat mesh on a pivot; rotation is derived from the clock every frame. */
function Bat({ swingAtMs }: { swingAtMs: number | null }) {
  const pivot = useRef<Group>(null)

  useFrame(() => {
    const g = pivot.current
    if (!g) return
    let p = 0 // 0 = cocked, 1 = follow-through
    if (swingAtMs != null) {
      const dt = performance.now() - swingAtMs
      if (dt >= 0 && dt <= SWING_MS) {
        p = smoothstep(dt / SWING_MS)
      } else if (dt > SWING_MS) {
        const back = (dt - SWING_MS) / SWING_RETURN_MS
        p = back >= 1 ? 0 : 1 - smoothstep(back)
      }
    }
    g.rotation.y = BAT_REST_Y + SWING_ARC * p
    g.rotation.x = BAT_REST_X + (BAT_SWING_X - BAT_REST_X) * p
  })

  return (
    <group ref={pivot} position={[0.1, FIGURE_HEIGHT * 0.58, -0.2]}>
      <mesh position={[0, 0, 1.6]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.22, 0.1, 3.2, 10]} />
        <meshLambertMaterial color={COLORS.bat} />
      </mesh>
    </group>
  )
}

export type BatterProps = {
  url?: string
  /** performance.now() of the latest swing commit, or null when the player didn't swing. */
  swingAtMs: number | null
}

/**
 * Right-handed batter: stands on the third-base (-X) side of the plate and
 * faces +X (toward the plate / the camera's left-to-right axis).
 */
export function Batter({ url, swingAtMs }: BatterProps) {
  const body = useRef<Group>(null)

  // Subtle torso rotation driven by the same swing clock as the bat.
  useFrame(() => {
    const g = body.current
    if (!g) return
    let p = 0
    if (swingAtMs != null) {
      const dt = performance.now() - swingAtMs
      if (dt >= 0 && dt <= SWING_MS) p = smoothstep(dt / SWING_MS)
      else if (dt > SWING_MS) {
        const back = (dt - SWING_MS) / SWING_RETURN_MS
        p = back >= 1 ? 0 : 1 - smoothstep(back)
      }
    }
    g.rotation.y = 0.35 - 0.7 * p
  })

  const fallback = <StylizedFigure shirt={COLORS.batterShirt} />

  return (
    <group ref={body}>
      {url ? (
        <ModelErrorBoundary fallback={fallback}>
          <Suspense fallback={fallback}>
            <GlbFigure url={url} swingAtMs={swingAtMs} />
          </Suspense>
        </ModelErrorBoundary>
      ) : (
        fallback
      )}
      <Bat swingAtMs={swingAtMs} />
    </group>
  )
}
