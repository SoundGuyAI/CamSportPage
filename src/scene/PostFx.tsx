import { useThree } from '@react-three/fiber'
import { Bloom, EffectComposer, ToneMapping } from '@react-three/postprocessing'
import { KernelSize, ToneMappingMode } from 'postprocessing'
import { useMemo } from 'react'
import {
  BLOOM_INTENSITY,
  BLOOM_SMOOTHING,
  BLOOM_THRESHOLD,
  bloomIsAffordable,
} from './quality'
import type { SceneQuality } from './quality'

/**
 * §10 item 17 — a single bloom pass, gated behind a capability check.
 *
 * The composer renders the scene into a half-float target, which means three.js
 * skips its in-material tone mapping (it only runs when drawing to the default
 * framebuffer), so the ACES operator is re-applied here as the last effect. The
 * renderer's `toneMappingExposure` (1.05) still feeds the shared
 * `toneMappingExposure` uniform, so the graded image is identical with bloom on
 * or off — only the glow is added.
 *
 * What actually crosses the 0.78 threshold: the ball's emissive shell, the
 * additive perfect-zone glow, the contact star / chevrons, the landing puff, the
 * home-run wall flash and the three fireworks. Sunlit grass tops out near 0.35
 * and the sky near 0.5, so the park itself does not bloom.
 */
export function PostFx({ quality = 'auto' }: { quality?: SceneQuality }) {
  const gl = useThree((s) => s.gl)
  const enabled = useMemo(() => {
    if (quality === 'low') return false
    if (quality === 'high') return true
    return bloomIsAffordable(gl)
  }, [quality, gl])

  if (!enabled) return null

  return (
    <EffectComposer multisampling={0}>
      <Bloom
        intensity={BLOOM_INTENSITY}
        luminanceThreshold={BLOOM_THRESHOLD}
        luminanceSmoothing={BLOOM_SMOOTHING}
        mipmapBlur
        kernelSize={KernelSize.SMALL}
      />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  )
}
