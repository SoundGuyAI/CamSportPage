import { useFrame } from '@react-three/fiber'
import { Suspense, useRef } from 'react'
import type { Group } from 'three'
import { COLORS } from './constants'
import { GlbFigure, ModelErrorBoundary } from './GlbFigure'
import { StylizedFigure } from './StylizedFigure'

const WINDUP_MS = 500
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

export type PitcherProps = {
  url?: string
  /** performance.now() of the current pitch release, or null when idle. */
  releaseAtMs: number | null
}

/** Pitcher on the mound, facing the plate (+Z). Wind-up is a trivial time-based lean. */
export function Pitcher({ url, releaseAtMs }: PitcherProps) {
  const body = useRef<Group>(null)

  useFrame(() => {
    const g = body.current
    if (!g) return
    if (releaseAtMs == null) {
      g.rotation.x = 0
      g.rotation.y = 0
      return
    }
    const dt = performance.now() - releaseAtMs
    // Snap forward at release, then settle back over WINDUP_MS.
    const k = 1 - clamp01(dt / WINDUP_MS)
    g.rotation.x = 0.28 * k
    g.rotation.y = -0.25 * k
  })

  const fallback = <StylizedFigure shirt={COLORS.pitcherShirt} />

  return (
    <group ref={body}>
      {url ? (
        <ModelErrorBoundary fallback={fallback}>
          <Suspense fallback={fallback}>
            <GlbFigure url={url} tint={COLORS.pitcherShirt} />
          </Suspense>
        </ModelErrorBoundary>
      ) : (
        fallback
      )}
    </group>
  )
}
