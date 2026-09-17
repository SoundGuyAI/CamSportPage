import { useAnimations, useGLTF } from '@react-three/drei'
import { Component, useEffect, useMemo, useRef } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { Box3, Color, LoopOnce, Matrix4, MeshStandardMaterial, Vector3 } from 'three'
import type { Group, Material, Mesh, Object3D } from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { FIGURE_HEIGHT } from './constants'

type GlbFigureProps = {
  url: string
  /** Optional hex tint applied to cloned materials (lets one GLB serve two roles). */
  tint?: string
  /** Timestamp of the latest swing commit; a one-shot swing clip fires when it changes. */
  swingAtMs?: number | null
  /** Playback rate for the swing clip — 1.4 for a bat cut, 0.9 for a pitcher's wind-up. */
  swingTimeScale?: number
  /** Timestamp at which to fire a celebration clip (ThumbsUp / Wave) once. */
  celebrateAtMs?: number | null
}

const IDLE_RE = /idle/i
const SWING_RE = /punch|swing|hit|attack|bat/i
const CELEBRATE_RE = /thumb|wave|yes|dance|jump/i

/** Team colour dominates the placeholder grey-yellow robot at 0.8. */
const TINT_STRENGTH = 0.8

/**
 * Loads a rigged glTF, normalises it to FIGURE_HEIGHT with feet on the ground,
 * and plays a looping idle clip. Every instance gets its own SkeletonUtils clone,
 * so the same cached `useGLTF` scene can be mounted twice (batter + pitcher)
 * with independent AnimationMixers.
 */
export function GlbFigure({
  url,
  tint,
  swingAtMs,
  swingTimeScale = 1.4,
  celebrateAtMs,
}: GlbFigureProps) {
  const { scene, animations } = useGLTF(url)
  const group = useRef<Group>(null)

  const model = useMemo(() => {
    const copy = cloneSkinned(scene) as Object3D
    const color = tint ? new Color(tint) : null
    const recolor = (m: Material) => {
      const c = m.clone() as MeshStandardMaterial
      if (color && c.color) c.color.lerp(color, TINT_STRENGTH)
      return c
    }
    copy.traverse((o: Object3D) => {
      const mesh = o as Mesh
      if (!mesh.isMesh) return
      // oxlint-disable-next-line immutability -- three.js scene graph is mutable by design
      mesh.castShadow = true
      mesh.receiveShadow = false
      if (!color) return
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map(recolor)
        : recolor(mesh.material)
    })
    return copy
  }, [scene, tint])

  // Bind-pose bounding box. NOTE: `Box3.setFromObject` on a SkinnedMesh returns the
  // skinning-expanded bounds (e.g. 149 units tall for RobotExpressive), so we union the
  // untransformed geometry boxes instead. glTF is Y-up by spec; that is all we assume.
  const fit = useMemo(() => {
    model.updateWorldMatrix(false, true)
    const box = new Box3()
    const local = new Box3()
    const inv = new Matrix4().copy(model.matrixWorld).invert()
    const toRoot = new Matrix4()
    model.traverse((o: Object3D) => {
      const geometry = (o as Mesh).geometry
      if (!geometry) return
      if (!geometry.boundingBox) geometry.computeBoundingBox()
      if (!geometry.boundingBox) return
      toRoot.multiplyMatrices(inv, o.matrixWorld)
      local.copy(geometry.boundingBox).applyMatrix4(toRoot)
      box.union(local)
    })
    if (box.isEmpty()) {
      return { scale: 1, offset: [0, 0, 0] as [number, number, number] }
    }
    const size = box.getSize(new Vector3())
    const center = box.getCenter(new Vector3())
    const height = Number.isFinite(size.y) && size.y > 1e-3 ? size.y : FIGURE_HEIGHT
    const s = Math.min(1000, Math.max(0.001, FIGURE_HEIGHT / height))
    return {
      scale: s,
      // centre on X/Z, drop feet onto y = 0
      offset: [-center.x * s, -box.min.y * s, -center.z * s] as [number, number, number],
    }
  }, [model])

  const { actions, names } = useAnimations(animations, group)

  const idleName = useMemo(() => names.find((n) => IDLE_RE.test(n)) ?? names[0], [names])
  const swingName = useMemo(() => names.find((n) => SWING_RE.test(n)), [names])
  const celebrateName = useMemo(() => names.find((n) => CELEBRATE_RE.test(n)), [names])

  useEffect(() => {
    const idle = idleName ? actions[idleName] : undefined
    idle?.reset().fadeIn(0.2).play()
    return () => {
      idle?.fadeOut(0.2)
    }
  }, [actions, idleName])

  useEffect(() => {
    if (swingAtMs == null || !swingName) return
    const swing = actions[swingName]
    const idle = idleName ? actions[idleName] : undefined
    if (!swing) return
    swing.reset()
    swing.setLoop(LoopOnce, 1)
    // oxlint-disable-next-line immutability -- three.js AnimationAction is imperative by design
    swing.clampWhenFinished = true
    swing.timeScale = swingTimeScale
    swing.fadeIn(0.05).play()
    const ms = (swing.getClip().duration / swingTimeScale) * 1000
    const back = window.setTimeout(() => {
      swing.fadeOut(0.2)
      idle?.reset().fadeIn(0.2).play()
    }, ms)
    return () => window.clearTimeout(back)
  }, [actions, swingAtMs, swingName, swingTimeScale, idleName])

  // Celebration (ThumbsUp on a perfect hit): scheduled off the snapshot timestamp,
  // so it fires at exactly `resolvedAtMs + 400` however late React renders.
  useEffect(() => {
    if (celebrateAtMs == null || !celebrateName) return
    const clip = actions[celebrateName]
    const idle = idleName ? actions[idleName] : undefined
    if (!clip) return
    let back = 0
    const fire = window.setTimeout(
      () => {
        clip.reset()
        clip.setLoop(LoopOnce, 1)
        // oxlint-disable-next-line immutability -- three.js AnimationAction is imperative by design
        clip.clampWhenFinished = true
        clip.timeScale = 1
        clip.fadeIn(0.12).play()
        back = window.setTimeout(
          () => {
            clip.fadeOut(0.25)
            idle?.reset().fadeIn(0.25).play()
          },
          clip.getClip().duration * 1000,
        )
      },
      Math.max(0, celebrateAtMs - performance.now()),
    )
    return () => {
      window.clearTimeout(fire)
      window.clearTimeout(back)
    }
  }, [actions, celebrateAtMs, celebrateName, idleName])

  return (
    <group ref={group}>
      <group position={fit.offset} scale={fit.scale}>
        <primitive object={model} />
      </group>
    </group>
  )
}

type BoundaryProps = { fallback: ReactNode; children: ReactNode }
type BoundaryState = { failed: boolean }

/** Catches GLB load/parse failures (useGLTF throws in render) and shows the fallback. */
export class ModelErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false }

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('[BattingScene] model failed to load, using fallback figure', error, info)
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
