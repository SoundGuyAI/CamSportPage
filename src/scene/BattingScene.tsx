import { Canvas } from '@react-three/fiber'
import type { RootState } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { ACESFilmicToneMapping } from 'three'
import type { DirectionalLight } from 'three'
import { RESULT_HOLD_MS, WHIFF_HOLD_MS } from '../game/GameSession'
import type { SessionSnapshot } from '../game/types'
import { Backdrop } from './Backdrop'
import { Ball } from './Ball'
import { Batter } from './Batter'
import { CameraRig } from './CameraRig'
import { BATTER_POSITION, CAMERA_FOV, CAMERA_POSITION, CAMERA_TARGET, COLORS, PITCHER_POSITION } from './constants'
import { Field } from './Field'
import { Impact } from './Impact'
import { Pitcher } from './Pitcher'
import { PostFx } from './PostFx'
import type { SceneQuality } from './quality'
import './scene.css'

export type BattingSceneProps = {
  snapshot: SessionSnapshot
  /** e.g. `${import.meta.env.BASE_URL}models/batter.glb`; omit for the procedural figure. */
  batterUrl?: string
  /** Optional separate model for the pitcher; falls back to `batterUrl`, then to primitives. */
  pitcherUrl?: string
  /**
   * Turf albedo tile multiplied under the mow stripes (§10 item 18). Defaults to
   * the bundled ambientCG Grass004 tile under the Vite base URL; pass `null` to
   * ship the procedural stripes alone.
   */
  turfUrl?: string | null
  /**
   * `'auto'` (default) enables bloom only on a capable display — dpr ≥ 1.25,
   * viewport ≥ 760 px, no `prefers-reduced-motion`, no software renderer.
   * `'high'` / `'low'` force it on / off.
   */
  quality?: SceneQuality
  className?: string
}

/** ThumbsUp lag after a perfect result (ms). */
const CELEBRATE_DELAY_MS = 400

/**
 * Bundled turf tile. Derived from the Vite base URL so the GitHub Pages
 * deployment (`/CamSportPage/`) and a local dev server both resolve it.
 */
const DEFAULT_TURF_URL = `${import.meta.env.BASE_URL}textures/grass004-color.jpg`

/** Shadow map: 1024 over a tight ±34 ft box ≈ 15 px/ft on the batter. */
const SHADOW_EXTENT = 34

function aimCamera({ camera, gl }: RootState) {
  camera.lookAt(CAMERA_TARGET[0], CAMERA_TARGET[1], CAMERA_TARGET[2])
  camera.updateProjectionMatrix()
  gl.toneMapping = ACESFilmicToneMapping
  gl.toneMappingExposure = 1.05
}

/**
 * The one sun. High and slightly camera-left, so the batter's shadow falls
 * toward first base and the ball stays lit against the sky.
 */
function Sun() {
  const light = useRef<DirectionalLight>(null)

  useEffect(() => {
    const l = light.current
    if (!l) return
    const cam = l.shadow.camera
    cam.left = -SHADOW_EXTENT
    cam.right = SHADOW_EXTENT
    cam.top = SHADOW_EXTENT
    cam.bottom = -SHADOW_EXTENT
    cam.near = 40
    cam.far = 260
    cam.updateProjectionMatrix()
    l.shadow.bias = -0.0006
    l.shadow.normalBias = 0.02
  }, [])

  return (
    <directionalLight
      ref={light}
      position={[-120, 180, 90]}
      color={'#FFF6E0'}
      intensity={2.1}
      castShadow
      shadow-mapSize={[1024, 1024]}
    />
  )
}

/** Device pixel ratio cap: chalk lines alias badly below 1.5 on a retina phone. */
function dprRange(): [number, number] {
  if (typeof window === 'undefined') return [1, 1.5]
  const high = window.devicePixelRatio > 1 && window.innerWidth > 900
  return [1, high ? 1.75 : 1.5]
}

/**
 * Stylized 3D presentation layer. Reads `SessionSnapshot` only — all motion is
 * derived from its timestamps against `performance.now()`. No physics engine,
 * no imperative tweens, no randomness. See `demo.md` for units + mounting.
 */
export function BattingScene({
  snapshot,
  batterUrl,
  pitcherUrl,
  turfUrl,
  quality = 'auto',
  className,
}: BattingSceneProps) {
  const dpr = useMemo(() => dprRange(), [])
  const turf = turfUrl === undefined ? DEFAULT_TURF_URL : turfUrl

  const last = snapshot.lastResult
  const swingAtMs = last?.commit != null ? last.commit.atMs : null
  const celebrateAtMs =
    last != null && last.band === 'perfect' ? last.resolvedAtMs + CELEBRATE_DELAY_MS : null
  const releaseAtMs =
    snapshot.phase === 'pitching' && snapshot.current ? snapshot.current.startedAtMs : null
  // The next release is predictable from the result hold, which lets the pitcher
  // start his rock-back 260 ms before the ball leaves his hand.
  const nextReleaseAtMs =
    snapshot.phase === 'result' && last != null
      ? last.resolvedAtMs +
        (last.outcome.flightMs > 0 ? last.outcome.flightMs + RESULT_HOLD_MS : WHIFF_HOLD_MS)
      : null

  return (
    <div className={className ? `camsport-scene ${className}` : 'camsport-scene'}>
      <Canvas
        dpr={dpr}
        shadows
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ fov: CAMERA_FOV, near: 0.5, far: 2000, position: CAMERA_POSITION }}
        onCreated={aimCamera}
      >
        <fog attach="fog" args={[COLORS.skyHorizon, 340, 1200]} />

        <ambientLight intensity={0.35} />
        <hemisphereLight args={['#9FD0F5', '#4A8F3C', 0.9]} />
        <Sun />

        <Backdrop />
        <Field snapshot={snapshot} turfUrl={turf} />

        <group position={BATTER_POSITION} rotation={[0, Math.PI / 2, 0]}>
          <Batter
            url={batterUrl}
            swingAtMs={swingAtMs}
            sway={snapshot.phase !== 'result'}
            celebrateAtMs={celebrateAtMs}
          />
        </group>

        <group position={PITCHER_POSITION}>
          <Pitcher
            url={pitcherUrl ?? batterUrl}
            releaseAtMs={releaseAtMs}
            nextReleaseAtMs={nextReleaseAtMs}
          />
        </group>

        <Ball snapshot={snapshot} />
        <Impact snapshot={snapshot} />
        <CameraRig snapshot={snapshot} />
        <PostFx quality={quality} />
      </Canvas>
    </div>
  )
}
