import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { BufferAttribute, BufferGeometry, DoubleSide, Shape } from 'three'
import type { CanvasTexture, MeshStandardMaterial } from 'three'
import type { SessionSnapshot } from '../game/types'
import {
  BASE_POSITIONS,
  COLORS,
  DEG,
  FENCE_HEIGHT,
  FENCE_LINE_FT,
  FOUL_DEG,
  MOUND_DISTANCE,
  WALL_KICK_H,
  WALL_PAD_H,
  fenceRadius,
} from './constants'
import {
  FIELD_MAP_CENTER_Z,
  FIELD_MAP_FT,
  applyTurfToFieldMap,
  distanceMarkerTexture,
  fieldMapTexture,
} from './textures'
import { useGeneratedTexture } from './useGeneratedTexture'

/** Home-plate pentagon (17" wide) drawn in the XZ plane, scaled to feet. */
function usePlateShape() {
  return useMemo(() => {
    const w = 0.71 // 17in / 2, in feet
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

const WALL_SEGMENTS = 64

/**
 * One horizontal band of the outfield wall, swept along the fence arc between
 * two heights. UVs run 0..1 along the arc so a banded texture would tile, but
 * the bands are flat colours today.
 */
function wallBandGeometry(y0: number, y1: number): BufferGeometry {
  const pos: number[] = []
  const uv: number[] = []
  for (let i = 0; i < WALL_SEGMENTS; i++) {
    const k0 = i / WALL_SEGMENTS
    const k1 = (i + 1) / WALL_SEGMENTS
    const d0 = -FOUL_DEG + k0 * FOUL_DEG * 2
    const d1 = -FOUL_DEG + k1 * FOUL_DEG * 2
    const r0 = fenceRadius(d0)
    const r1 = fenceRadius(d1)
    const x0 = Math.sin(d0 * DEG) * r0
    const z0 = -Math.cos(d0 * DEG) * r0
    const x1 = Math.sin(d1 * DEG) * r1
    const z1 = -Math.cos(d1 * DEG) * r1
    pos.push(x0, y0, z0, x1, y0, z1, x1, y1, z1)
    pos.push(x0, y0, z0, x1, y1, z1, x0, y1, z0)
    uv.push(k0, 0, k1, 0, k1, 1)
    uv.push(k0, 0, k1, 1, k0, 1)
  }
  const geom = new BufferGeometry()
  geom.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  geom.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
  geom.computeVertexNormals()
  return geom
}

function useWallBands() {
  const bands = useMemo(
    () => ({
      kick: wallBandGeometry(0, WALL_KICK_H),
      pad: wallBandGeometry(WALL_KICK_H, WALL_PAD_H),
      rail: wallBandGeometry(WALL_PAD_H, FENCE_HEIGHT),
    }),
    [],
  )
  useEffect(
    () => () => {
      bands.kick.dispose()
      bands.pad.dispose()
      bands.rail.dispose()
    },
    [bands],
  )
  return bands
}

/** Yellow foul pole with a fair-side screen fin, at the 330-ft line ends. */
function FoulPole({ deg }: { deg: number }) {
  const r = FENCE_LINE_FT
  const x = Math.sin(deg * DEG) * r
  const z = -Math.cos(deg * DEG) * r
  // inward (toward the plate) unit vector
  const ix = -Math.sin(deg * DEG)
  const iz = Math.cos(deg * DEG)
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 17, 0]}>
        <cylinderGeometry args={[0.5, 0.5, 34, 8]} />
        <meshStandardMaterial color={COLORS.wallRail} roughness={0.6} />
      </mesh>
      <mesh position={[ix * 2.6, 20, iz * 2.6]} rotation={[0, (deg - 180) * DEG, 0]}>
        <boxGeometry args={[5, 24, 0.2]} />
        <meshStandardMaterial
          color={COLORS.wallRail}
          roughness={0.7}
          transparent
          opacity={0.72}
          side={DoubleSide}
        />
      </mesh>
    </group>
  )
}

const MARKERS: [string, number][] = [
  ['330', -45],
  ['375', -22],
  ['400', 0],
  ['375', 22],
  ['330', 45],
]

function DistanceMarker({ text, deg }: { text: string; deg: number }) {
  const factory = useMemo(() => () => distanceMarkerTexture(text), [text])
  const map = useGeneratedTexture(factory)
  const r = fenceRadius(deg) - 1.8
  return (
    <mesh
      position={[Math.sin(deg * DEG) * r, 4.6, -Math.cos(deg * DEG) * r]}
      rotation={[0, -deg * DEG, 0]}
    >
      <planeGeometry args={[9, 5]} />
      <meshBasicMaterial map={map} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

/** Wall padding emissive flash for the home-run celebration (0 → 0.9 → 0 over 420 ms). */
const HR_FLASH_MS = 420

/**
 * §10 item 18 — fold the optional turf albedo (ambientCG Grass004, CC0) into the
 * already-painted field map once it downloads, keeping the whole ground plane on
 * a single material. Any failure (404, decode error, tainted canvas) is silent:
 * the procedural stripes from item 1 stay exactly as they are.
 */
function useTurfUnderlay(map: CanvasTexture, url?: string | null) {
  useEffect(() => {
    if (!url || typeof Image === 'undefined') return
    let live = true
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.onload = () => {
      if (live) applyTurfToFieldMap(map, img)
    }
    img.src = url
    return () => {
      live = false
      img.onload = null
    }
  }, [map, url])
}

/**
 * The park: one procedural field map on a single plane, plus the pieces that
 * need real height (mound, plate, bases, banded wall, foul poles, markers).
 * See `demo.md` for the coordinate + texture constants.
 */
export function Field({
  snapshot,
  turfUrl,
}: {
  snapshot: SessionSnapshot
  /** Tiled turf albedo multiplied under the mow stripes; omit for stripes only. */
  turfUrl?: string | null
}) {
  const plate = usePlateShape()
  const bands = useWallBands()
  const fieldMap = useGeneratedTexture(fieldMapTexture)
  useTurfUnderlay(fieldMap, turfUrl)
  const padMat = useRef<MeshStandardMaterial>(null)

  useFrame(() => {
    const mat = padMat.current
    if (!mat) return
    const res = snapshot.lastResult
    let glow = 0
    if (res && res.outcome.kind === 'homer') {
      const k = (performance.now() - res.resolvedAtMs) / HR_FLASH_MS
      if (k >= 0 && k <= 1) glow = Math.sin(Math.PI * k) * 0.9
    }
    if (mat.emissiveIntensity !== glow) mat.emissiveIntensity = glow
  })

  return (
    <group>
      {/* Far ground: catches everything past the field map and fades into the fog. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.14, -200]}>
        <planeGeometry args={[2200, 2200]} />
        <meshStandardMaterial color={COLORS.outfieldRim} roughness={0.95} />
      </mesh>

      {/* The field map: mow fan, clay, infield diamond, base paths, chalk, warning track. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.02, FIELD_MAP_CENTER_Z]}
        receiveShadow
      >
        <planeGeometry args={[FIELD_MAP_FT, FIELD_MAP_FT]} />
        <meshStandardMaterial map={fieldMap} roughness={0.88} metalness={0} />
      </mesh>

      {/* Mound + rubber */}
      <mesh position={[0, 0.41, -MOUND_DISTANCE]} castShadow receiveShadow>
        <cylinderGeometry args={[9, 10, 0.83, 32]} />
        <meshStandardMaterial color={COLORS.clayDark} roughness={0.9} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.84, -MOUND_DISTANCE - 0.2]}>
        <planeGeometry args={[1, 0.5]} />
        <meshBasicMaterial color={COLORS.chalk} />
      </mesh>

      {/* Plate + bases */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <shapeGeometry args={[plate]} />
        <meshBasicMaterial color={COLORS.chalk} />
      </mesh>
      {BASE_POSITIONS.map((p) => (
        <mesh key={`${p[0]}:${p[2]}`} position={p} castShadow>
          <boxGeometry args={[1.25, 0.25, 1.25]} />
          <meshStandardMaterial color={COLORS.chalk} roughness={0.8} />
        </mesh>
      ))}

      {/* Outfield wall: kick strip / padding / top rail */}
      <mesh geometry={bands.kick}>
        <meshStandardMaterial color={COLORS.wallKick} roughness={0.9} side={DoubleSide} />
      </mesh>
      <mesh geometry={bands.pad}>
        <meshStandardMaterial
          ref={padMat}
          color={COLORS.wall}
          roughness={0.85}
          emissive={COLORS.wallRail}
          emissiveIntensity={0}
          side={DoubleSide}
        />
      </mesh>
      <mesh geometry={bands.rail}>
        <meshStandardMaterial color={COLORS.wallRail} roughness={0.55} side={DoubleSide} />
      </mesh>

      {MARKERS.map(([text, deg]) => (
        <DistanceMarker key={`${text}:${deg}`} text={text} deg={deg} />
      ))}
      <FoulPole deg={-FOUL_DEG} />
      <FoulPole deg={FOUL_DEG} />
    </group>
  )
}
