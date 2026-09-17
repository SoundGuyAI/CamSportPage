import { useFrame } from '@react-three/fiber'
import { Suspense, useRef } from 'react'
import type { Group } from 'three'
import { COLORS, clamp01, smoothstep } from './constants'
import { ChestNumber, ContactBlob, Headwear } from './Dressing'
import { GlbFigure, ModelErrorBoundary } from './GlbFigure'
import { StylizedFigure } from './StylizedFigure'

/** Settle time after release. */
const RELEASE_MS = 500
/** Lead-in: the rock-back starts this long before the *predicted* next release. */
const LEAD_MS = 260

export type PitcherProps = {
  url?: string
  /** performance.now() of the current pitch release, or null when idle. */
  releaseAtMs: number | null
  /** performance.now() when the next pitch is expected, for the wind-up lead-in. */
  nextReleaseAtMs?: number | null
}

/**
 * Pitcher on the mound, facing the plate (+Z). The wind-up is a deterministic
 * lean: a rock-back over the 260 ms before the predicted release, a forward
 * drive at release (0.20 rad), then a settle over 500 ms. The GLB's `Punch`
 * clip plays once at release at timeScale 0.9.
 */
export function Pitcher({ url, releaseAtMs, nextReleaseAtMs }: PitcherProps) {
  const body = useRef<Group>(null)

  useFrame(() => {
    const g = body.current
    if (!g) return
    const now = performance.now()

    if (releaseAtMs != null) {
      const k = 1 - clamp01((now - releaseAtMs) / RELEASE_MS)
      g.rotation.x = 0.2 * k
      g.rotation.y = -0.18 * k
      return
    }

    // lead-in before the next pitch: rock back, then hold until release
    if (nextReleaseAtMs != null) {
      const w = smoothstep((now - (nextReleaseAtMs - LEAD_MS)) / LEAD_MS)
      g.rotation.x = -0.14 * w
      g.rotation.y = 0.12 * w
      return
    }

    // idle breathing
    const secs = now / 1000
    g.rotation.x = Math.sin(secs * 0.9) * 0.02
    g.rotation.y = 0
  })

  const fallback = <StylizedFigure shirt={COLORS.pitcherTint} />

  return (
    <group ref={body}>
      {url ? (
        <ModelErrorBoundary fallback={fallback}>
          <Suspense fallback={fallback}>
            <GlbFigure
              url={url}
              tint={COLORS.pitcherTint}
              swingAtMs={releaseAtMs}
              swingTimeScale={0.9}
            />
          </Suspense>
        </ModelErrorBoundary>
      ) : (
        fallback
      )}
      <Headwear kind="cap" color={COLORS.pitcherTint} />
      <ChestNumber text="24" color={COLORS.chalk} />
      <ContactBlob />
    </group>
  )
}
