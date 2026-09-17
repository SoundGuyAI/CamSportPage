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
  clamp01,
  smoothstep,
} from './constants'
import { BatMesh, ChestNumber, Headwear } from './Dressing'
import { GlbFigure, ModelErrorBoundary } from './GlbFigure'
import { StylizedFigure } from './StylizedFigure'

/** 0 = cocked, 1 = follow-through, easing back over SWING_RETURN_MS. */
function swingPhase(swingAtMs: number | null): number {
  if (swingAtMs == null) return 0
  const dt = performance.now() - swingAtMs
  if (dt < 0) return 0
  if (dt <= SWING_MS) return smoothstep(dt / SWING_MS)
  const back = (dt - SWING_MS) / SWING_RETURN_MS
  return back >= 1 ? 0 : 1 - smoothstep(back)
}

/** Bat mesh on a pivot; rotation is derived from the clock every frame. */
function Bat({ swingAtMs }: { swingAtMs: number | null }) {
  const pivot = useRef<Group>(null)

  useFrame(() => {
    const g = pivot.current
    if (!g) return
    const p = swingPhase(swingAtMs)
    g.rotation.y = BAT_REST_Y + SWING_ARC * p
    g.rotation.x = BAT_REST_X + (BAT_SWING_X - BAT_REST_X) * p
  })

  return (
    <group ref={pivot} position={[0.1, FIGURE_HEIGHT * 0.58, -0.2]}>
      <BatMesh />
    </group>
  )
}

export type BatterProps = {
  url?: string
  /** performance.now() of the latest swing commit, or null when the player didn't swing. */
  swingAtMs: number | null
  /** false while a result is on screen — freezes the idle sway. */
  sway?: boolean
  /** performance.now() at which to fire the ThumbsUp clip (perfect hits only). */
  celebrateAtMs?: number | null
}

/**
 * Right-handed batter: stands on the third-base (-X) side of the plate and
 * faces +X (toward the plate / the camera's left-to-right axis).
 * Idle sway keeps him alive between pitches and freezes during the 180 ms swing
 * so the swing keeps all the energy.
 */
export function Batter({ url, swingAtMs, sway = true, celebrateAtMs }: BatterProps) {
  const body = useRef<Group>(null)

  useFrame(() => {
    const g = body.current
    if (!g) return
    const p = swingPhase(swingAtMs)
    g.rotation.y = 0.35 - 0.7 * p
    const swinging = swingAtMs != null && performance.now() - swingAtMs < SWING_MS
    const alive = sway && !swinging ? 1 - clamp01(p) : 0
    const secs = performance.now() / 1000
    g.rotation.z = Math.sin(secs * 1.1) * 0.035 * alive
    g.position.y = Math.sin(secs * 2.2) * 0.04 * alive
  })

  const fallback = <StylizedFigure shirt={COLORS.batterTint} />

  return (
    <group ref={body}>
      {url ? (
        <ModelErrorBoundary fallback={fallback}>
          <Suspense fallback={fallback}>
            <GlbFigure
              url={url}
              tint={COLORS.batterTint}
              swingAtMs={swingAtMs}
              celebrateAtMs={celebrateAtMs}
            />
          </Suspense>
        </ModelErrorBoundary>
      ) : (
        fallback
      )}
      <Headwear kind="helmet" color={COLORS.batterTint} accent={COLORS.batterAccent} />
      <ChestNumber text="9" color={COLORS.batterAccent} />
      <Bat swingAtMs={swingAtMs} />
    </group>
  )
}
