import { useMemo } from 'react'
import { DoubleSide, Shape } from 'three'
import {
  COLORS,
  FENCE_CENTER_FT,
  FENCE_HEIGHT,
  FENCE_LINE_FT,
  FOUL_DEG,
  MOUND_DISTANCE,
} from './constants'

const DEG = Math.PI / 180

/** Home-plate pentagon (17" wide) drawn in the XZ plane, scaled to feet. */
function usePlateShape() {
  return useMemo(() => {
    const w = 0.71 // 17in / 2 in feet
    const s = new Shape()
    s.moveTo(-w, -w)
    s.lineTo(w, -w)
    s.lineTo(w, w * 0.4)
    s.lineTo(0, w * 1.3)
    s.lineTo(-w, w * 0.4)
    s.closePath()
    return s
  }, [])
}

/** A flat chalk line from the plate out to `length` ft at `deg` off center. */
function FoulLine({ deg, length }: { deg: number; length: number }) {
  return (
    <mesh
      position={[
        (Math.sin(deg * DEG) * length) / 2,
        0.22,
        (-Math.cos(deg * DEG) * length) / 2,
      ]}
      rotation={[-Math.PI / 2, 0, -deg * DEG]}
    >
      <planeGeometry args={[0.9, length]} />
      <meshBasicMaterial color={COLORS.chalk} />
    </mesh>
  )
}

/**
 * Stylized, flat-shaded ballpark. Everything is a disc, plane or arc — no
 * textures, no shadows, nothing that costs a draw call it doesn't have to.
 * See `constants.ts` for the unit + axis conventions (1 unit = 1 ft, -Z = center field).
 */
export function Field() {
  const plate = usePlateShape()

  // Outfield fence: an arc sampled between the foul poles, bulging to
  // FENCE_CENTER_FT at dead center.
  const fenceGeom = useMemo(() => {
    const segments = 48
    const pts: number[] = []
    for (let i = 0; i <= segments; i++) {
      const k = i / segments
      const deg = -FOUL_DEG + k * FOUL_DEG * 2
      const bulge = Math.cos(deg * DEG * 2) * 0.5 + 0.5
      const r = FENCE_LINE_FT + (FENCE_CENTER_FT - FENCE_LINE_FT) * bulge
      pts.push(Math.sin(deg * DEG) * r, -Math.cos(deg * DEG) * r)
    }
    const positions: number[] = []
    for (let i = 0; i < segments; i++) {
      const x0 = pts[i * 2]
      const z0 = pts[i * 2 + 1]
      const x1 = pts[i * 2 + 2]
      const z1 = pts[i * 2 + 3]
      // two triangles per segment (quad standing on the ground)
      positions.push(
        x0, 0, z0, x1, 0, z1, x1, FENCE_HEIGHT, z1,
        x0, 0, z0, x1, FENCE_HEIGHT, z1, x0, FENCE_HEIGHT, z0,
      )
    }
    return new Float32Array(positions)
  }, [])

  return (
    <group>
      {/* Grass */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.6, -120]}>
        <planeGeometry args={[1600, 1600]} />
        <meshLambertMaterial color={COLORS.grass} />
      </mesh>

      {/* Dirt infield arc around the plate */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <circleGeometry args={[95, 48]} />
        <meshLambertMaterial color={COLORS.dirt} />
      </mesh>

      {/* Infield grass cut-out so the dirt reads as a skinned infield */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, -62]}>
        <circleGeometry args={[52, 40]} />
        <meshLambertMaterial color={COLORS.grass} />
      </mesh>

      {/* Mound */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.12, -MOUND_DISTANCE]}>
        <circleGeometry args={[9, 32]} />
        <meshLambertMaterial color={COLORS.dirtDark} />
      </mesh>
      <mesh position={[0, 0.45, -MOUND_DISTANCE]}>
        <cylinderGeometry args={[7.5, 9, 0.7, 32]} />
        <meshLambertMaterial color={COLORS.dirtDark} />
      </mesh>

      {/* Batter's box outline + plate */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.2, 0]}>
        <shapeGeometry args={[plate]} />
        <meshBasicMaterial color={COLORS.chalk} />
      </mesh>
      {[-2.8, 2.8].map((x) => (
        <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.16, 0.5]}>
          <ringGeometry args={[2.05, 2.2, 4, 1, Math.PI / 4]} />
          <meshBasicMaterial color={COLORS.chalk} side={DoubleSide} />
        </mesh>
      ))}

      <FoulLine deg={-FOUL_DEG} length={FENCE_LINE_FT} />
      <FoulLine deg={FOUL_DEG} length={FENCE_LINE_FT} />

      {/* Outfield fence */}
      <mesh>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[fenceGeom, 3]} />
        </bufferGeometry>
        <meshBasicMaterial color={COLORS.fence} side={DoubleSide} />
      </mesh>
    </group>
  )
}
