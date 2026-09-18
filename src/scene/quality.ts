/**
 * Capability gate for the optional post-processing pass (§10 item 17). Lives in
 * its own module so `PostFx.tsx` only ever exports a component (fast refresh).
 */
import type { WebGLRenderer } from 'three'

/**
 * Render quality override. `'auto'` runs the capability check below; `'high'`
 * and `'low'` force bloom on / off so the UI can expose a toggle later.
 */
export type SceneQuality = 'auto' | 'high' | 'low'

/** §10 item 17 — bloom settings, straight from the spec. */
export const BLOOM_INTENSITY = 0.55
export const BLOOM_THRESHOLD = 0.78
/** Knee below the threshold; keeps lit grass from flickering in and out. */
export const BLOOM_SMOOTHING = 0.16

/** Below these, the extra full-screen mip-blur pass is not worth the frame time. */
export const BLOOM_MIN_DPR = 1.25
export const BLOOM_MIN_WIDTH = 760

/** Renderer strings that mean "no GPU worth a post pass". */
const WEAK_GPU = /swiftshader|software|llvmpipe|basic render|microsoft basic/i

/**
 * Cheap, best-effort weak-GPU sniff: the unmasked renderer string when the
 * browser exposes it, plus a WebGL1 / tiny-texture-limit fallback. Never throws;
 * an unknown GPU is treated as fine (the dpr + width gates already filter phones).
 */
function isWeakGpu(gl: WebGLRenderer): boolean {
  try {
    const caps = gl.capabilities
    if (!caps.isWebGL2 || caps.maxTextureSize < 8192) return true
    const ctx = gl.getContext()
    const ext = ctx.getExtension('WEBGL_debug_renderer_info')
    if (!ext) return false
    const name = String(ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? '')
    return WEAK_GPU.test(name)
  } catch {
    return false
  }
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/** The `'auto'` gate: a capable display, a live user, and a real GPU. */
export function bloomIsAffordable(gl: WebGLRenderer): boolean {
  if (typeof window === 'undefined') return false
  if (window.devicePixelRatio < BLOOM_MIN_DPR) return false
  if (window.innerWidth < BLOOM_MIN_WIDTH) return false
  if (prefersReducedMotion()) return false
  return !isWeakGpu(gl)
}
