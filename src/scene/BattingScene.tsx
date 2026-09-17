import { Canvas } from '@react-three/fiber'
import type { RootState } from '@react-three/fiber'
import type { SessionSnapshot } from '../game/types'
import { Ball } from './Ball'
import { Batter } from './Batter'
import { BATTER_POSITION, COLORS, PITCHER_POSITION } from './constants'
import { Field } from './Field'
import { Pitcher } from './Pitcher'
import './scene.css'

export type BattingSceneProps = {
  snapshot: SessionSnapshot
  /** e.g. `${import.meta.env.BASE_URL}models/batter.glb`; omit for the procedural figure. */
  batterUrl?: string
  /** Optional separate model for the pitcher; falls back to `batterUrl`, then to primitives. */
  pitcherUrl?: string
  className?: string
}

/** Camera: behind and above the catcher, looking down the pitch toward the mound. */
const CAMERA_POSITION: [number, number, number] = [2.4, 12.5, 29.5]
const CAMERA_TARGET: [number, number, number] = [-0.2, 5.2, -42]

function aimCamera({ camera }: RootState) {
  camera.lookAt(CAMERA_TARGET[0], CAMERA_TARGET[1], CAMERA_TARGET[2])
  camera.updateProjectionMatrix()
}

/**
 * Stylized 3D presentation layer. Reads `SessionSnapshot` only — all motion is
 * derived from its timestamps against `performance.now()`. No physics engine,
 * no imperative tweens, no randomness. See `demo.md` for units + mounting.
 */
export function BattingScene({ snapshot, batterUrl, pitcherUrl, className }: BattingSceneProps) {
  const swingAtMs =
    snapshot.lastResult?.commit != null ? snapshot.lastResult.commit.atMs : null
  const releaseAtMs =
    snapshot.phase === 'pitching' && snapshot.current ? snapshot.current.startedAtMs : null

  return (
    <div className={className ? `camsport-scene ${className}` : 'camsport-scene'}>
      <Canvas
        dpr={[1, 1.5]}
        shadows={false}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ fov: 36, near: 0.5, far: 1800, position: CAMERA_POSITION }}
        onCreated={aimCamera}
      >
        <color attach="background" args={[COLORS.sky]} />
        <fog attach="fog" args={[COLORS.sky, 320, 1100]} />

        <ambientLight intensity={1.9} />
        <hemisphereLight args={[COLORS.sky, COLORS.grass, 1.1]} />
        <directionalLight position={[-60, 90, 40]} intensity={1.6} />

        <Field />

        <group position={BATTER_POSITION} rotation={[0, Math.PI / 2, 0]}>
          <Batter url={batterUrl} swingAtMs={swingAtMs} />
        </group>

        <group position={PITCHER_POSITION}>
          <Pitcher url={pitcherUrl ?? batterUrl} releaseAtMs={releaseAtMs} />
        </group>

        <Ball snapshot={snapshot} />
      </Canvas>
    </div>
  )
}
