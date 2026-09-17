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
}

const IDLE_RE = /idle/i
const SWING_RE = /punch|swing|hit|attack|bat/i

/**
 * Loads a rigged glTF, normalises it to FIGURE_HEIGHT with feet on the ground,
 * and plays a looping idle clip. Every instance gets its own SkeletonUtils clone,
 * so the same cached `useGLTF` scene can be mounted twice (batter + pitcher)
 * with independent AnimationMixers.
 */
export function GlbFigure({ url, tint, swingAtMs }: GlbFigureProps) {
  const { scene, animations } = useGLTF(url)
  const group = useRef<Group>(null)

  const model = useMemo(() => {
    const copy = cloneSkinned(scene) as Object3D
    if (tint) {
      const color = new Color(tint)
      const recolor = (m: Material) => {
        const c = m.clone() as MeshStandardMaterial
        if (c.color) c.color.lerp(color, 0.65)
        return c
      }
      copy.traverse((o: Object3D) => {
        const mesh = o as Mesh
        if (!mesh.isMesh) return
        mesh.material = Array.isArray(mesh.material)
          ? mesh.material.map(recolor)
          : recolor(mesh.material)
      })
    }
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
    swing.timeScale = 1.4
    swing.fadeIn(0.05).play()
    const ms = (swing.getClip().duration / 1.4) * 1000
    const back = window.setTimeout(() => {
      swing.fadeOut(0.2)
      idle?.reset().fadeIn(0.2).play()
    }, ms)
    return () => window.clearTimeout(back)
  }, [actions, swingAtMs, swingName, idleName])

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
