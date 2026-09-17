import { useMemo } from 'react'
import { DoubleSide } from 'three'
import { COLORS, FIGURE_HEIGHT } from './constants'
import { batGradientTexture, jerseyNumberTexture, shadowBlobTexture } from './textures'
import { useGeneratedTexture } from './useGeneratedTexture'

/** Head height used for the hat, in feet. Tuned to sit on RobotExpressive's head. */
export const HEAD_Y = FIGURE_HEIGHT * 0.885

/**
 * Cap (pitcher) or batting helmet (batter): a hemisphere dome plus a half-disc
 * brim, with an extra ear flap on the helmet. Parented to the figure group —
 * RobotExpressive's head bone moves only slightly in `Idle`.
 */
export function Headwear({
  kind,
  color,
  accent = COLORS.batterAccent,
}: {
  kind: 'cap' | 'helmet'
  color: string
  accent?: string
}) {
  const r = kind === 'helmet' ? 0.66 : 0.6
  return (
    <group position={[0, HEAD_Y, 0]}>
      <mesh castShadow>
        <sphereGeometry args={[r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      {/* brim: half cylinder, stretched forward (+Z is the figure's facing) */}
      <mesh position={[0, 0.03, 0.06]} scale={[1, 1, 1.5]} rotation={[0, Math.PI, 0]}>
        <cylinderGeometry args={[r * 1.02, r * 1.02, 0.08, 16, 1, false, 0, Math.PI]} />
        <meshStandardMaterial color={color} roughness={0.6} side={DoubleSide} />
      </mesh>
      {kind === 'helmet' && (
        <mesh position={[-r * 0.86, -0.12, 0.02]}>
          <boxGeometry args={[0.12, 0.34, 0.4]} />
          <meshStandardMaterial color={accent} roughness={0.6} />
        </mesh>
      )}
    </group>
  )
}

/** Flat chest number on the jersey front (local +Z). */
export function ChestNumber({ text, color }: { text: string; color: string }) {
  const factory = useMemo(() => () => jerseyNumberTexture(text, color), [text, color])
  const map = useGeneratedTexture(factory)
  return (
    <mesh position={[0, FIGURE_HEIGHT * 0.62, 0.5]}>
      <planeGeometry args={[0.9, 0.9]} />
      <meshBasicMaterial map={map} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

/**
 * Two-part bat: tapered barrel with a length-wise sun gradient, dark taped
 * handle and a knob. Runs along the pivot's local +Z.
 */
export function BatMesh() {
  const map = useGeneratedTexture(batGradientTexture)
  return (
    <group>
      <mesh position={[0, 0, 1.75]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.14, 2.3, 10]} />
        <meshStandardMaterial map={map} color={COLORS.batBarrel} roughness={0.45} metalness={0} />
      </mesh>
      <mesh position={[0, 0, 0.15]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.09, 0.9, 8]} />
        <meshStandardMaterial color={COLORS.batHandle} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0, -0.32]}>
        <sphereGeometry args={[0.12, 10, 8]} />
        <meshStandardMaterial color={COLORS.batHandle} roughness={0.7} />
      </mesh>
    </group>
  )
}

/**
 * Baked contact blob. The directional shadow map only covers a tight ±34 ft box
 * around the plate, so the pitcher (60 ft out) gets this instead.
 */
export function ContactBlob({ scale = 1 }: { scale?: number }) {
  const map = useGeneratedTexture(shadowBlobTexture)
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.6, 0.05, 0.3]} scale={[scale, scale, 1]}>
      <planeGeometry args={[5, 3.2]} />
      <meshBasicMaterial map={map} transparent opacity={0.42} depthWrite={false} />
    </mesh>
  )
}
