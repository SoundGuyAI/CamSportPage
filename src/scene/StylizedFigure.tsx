import { COLORS, FIGURE_HEIGHT } from './constants'

/**
 * Procedural fallback humanoid — used when no GLB url is supplied or the GLB
 * fails to load. Built from primitives only, sized to FIGURE_HEIGHT (6 ft),
 * feet on y = 0, facing +Z in local space.
 */
export function StylizedFigure({ shirt = COLORS.batterShirt }: { shirt?: string }) {
  const h = FIGURE_HEIGHT
  return (
    <group>
      {/* legs */}
      {[-0.32, 0.32].map((x) => (
        <mesh key={x} position={[x, h * 0.21, 0]}>
          <capsuleGeometry args={[0.24, h * 0.3, 4, 8]} />
          <meshLambertMaterial color={COLORS.batterPants} />
        </mesh>
      ))}
      {/* torso */}
      <mesh position={[0, h * 0.6, 0]}>
        <capsuleGeometry args={[0.52, h * 0.3, 4, 10]} />
        <meshLambertMaterial color={shirt} />
      </mesh>
      {/* arms */}
      {[-0.68, 0.68].map((x) => (
        <mesh key={x} position={[x, h * 0.63, 0.12]} rotation={[0.3, 0, x > 0 ? -0.35 : 0.35]}>
          <capsuleGeometry args={[0.17, h * 0.26, 4, 8]} />
          <meshLambertMaterial color={COLORS.skin} />
        </mesh>
      ))}
      {/* head + cap */}
      <mesh position={[0, h * 0.9, 0]}>
        <sphereGeometry args={[0.42, 16, 12]} />
        <meshLambertMaterial color={COLORS.skin} />
      </mesh>
      <mesh position={[0, h * 0.96, 0]}>
        <sphereGeometry args={[0.44, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshLambertMaterial color={shirt} />
      </mesh>
    </group>
  )
}
