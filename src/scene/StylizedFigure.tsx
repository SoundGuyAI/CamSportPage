import { COLORS, FIGURE_HEIGHT } from './constants'

/**
 * Procedural fallback humanoid — used when no GLB url is supplied or the GLB
 * fails to load. Built from primitives only, sized to FIGURE_HEIGHT (6 ft),
 * feet on y = 0, facing +Z in local space. Headwear / chest number / bat come
 * from `Dressing.tsx`, so this path is dressed exactly like the GLB one.
 */
export function StylizedFigure({ shirt = COLORS.batterTint }: { shirt?: string }) {
  const h = FIGURE_HEIGHT
  return (
    <group>
      {/* legs */}
      {[-0.32, 0.32].map((x) => (
        <mesh key={x} position={[x, h * 0.21, 0]} castShadow>
          <capsuleGeometry args={[0.24, h * 0.3, 4, 8]} />
          <meshStandardMaterial color={COLORS.pants} roughness={0.85} />
        </mesh>
      ))}
      {/* torso */}
      <mesh position={[0, h * 0.6, 0]} castShadow>
        <capsuleGeometry args={[0.52, h * 0.3, 4, 10]} />
        <meshStandardMaterial color={shirt} roughness={0.85} />
      </mesh>
      {/* arms */}
      {[-0.68, 0.68].map((x) => (
        <mesh
          key={x}
          position={[x, h * 0.63, 0.12]}
          rotation={[0.3, 0, x > 0 ? -0.35 : 0.35]}
          castShadow
        >
          <capsuleGeometry args={[0.17, h * 0.26, 4, 8]} />
          <meshStandardMaterial color={COLORS.skin} roughness={0.8} />
        </mesh>
      ))}
      {/* head */}
      <mesh position={[0, h * 0.9, 0]} castShadow>
        <sphereGeometry args={[0.42, 16, 12]} />
        <meshStandardMaterial color={COLORS.skin} roughness={0.8} />
      </mesh>
    </group>
  )
}
