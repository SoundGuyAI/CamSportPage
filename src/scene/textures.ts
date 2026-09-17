/**
 * Every texture in the scene is drawn at runtime on a 2D canvas — zero download,
 * zero external assets, and all of it deterministic (no `Math.random`: the crowd
 * speckle uses the same integer hash as the game code).
 *
 * Factories are plain functions; components wrap them in `useGeneratedTexture`
 * so each texture is built once and disposed on unmount.
 */
import { CanvasTexture, ClampToEdgeWrapping, RepeatWrapping, SRGBColorSpace } from 'three'
import { COLORS, DEG, FENCE_LINE_FT, FOUL_DEG, fenceRadius, hash01 } from './constants'

type Ctx = CanvasRenderingContext2D

const HAS_DOM = typeof document !== 'undefined'

/** 2D context of a fresh canvas, or `null` outside a browser. */
function makeCtx(w: number, h: number): Ctx | null {
  if (!HAS_DOM) return null
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  return canvas.getContext('2d')
}

type FinishOpts = { srgb?: boolean; wrap?: boolean }

function finish(ctx: Ctx | null, opts: FinishOpts = {}): CanvasTexture {
  const tex = ctx ? new CanvasTexture(ctx.canvas) : new CanvasTexture()
  if (opts.srgb !== false) tex.colorSpace = SRGBColorSpace
  const wrap = opts.wrap ? RepeatWrapping : ClampToEdgeWrapping
  tex.wrapS = wrap
  tex.wrapT = wrap
  tex.needsUpdate = true
  return tex
}

// ---------------------------------------------------------------------------
// Sky
// ---------------------------------------------------------------------------

/** 4 x 256 vertical gradient for the sky dome (zenith → mid → horizon haze). */
export function skyGradientTexture(): CanvasTexture {
  const ctx = makeCtx(4, 256)
  if (ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, 256)
    g.addColorStop(0, COLORS.skyZenith)
    g.addColorStop(0.5, COLORS.skyMid)
    g.addColorStop(1, COLORS.skyHorizon)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 4, 256)
  }
  return finish(ctx)
}

/** 256 x 128 cartoon cloud: overlapping soft discs with a cool underside. */
export function cloudTexture(): CanvasTexture {
  const ctx = makeCtx(256, 128)
  if (ctx) {
    const puff = (cx: number, cy: number, r: number, color: string) => {
      const g = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r)
      g.addColorStop(0, color)
      g.addColorStop(0.7, color)
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fill()
    }
    puff(78, 92, 46, COLORS.cloudUnder)
    puff(140, 96, 40, COLORS.cloudUnder)
    puff(190, 88, 34, COLORS.cloudUnder)
    puff(84, 72, 46, COLORS.cloud)
    puff(140, 62, 54, COLORS.cloud)
    puff(196, 74, 38, COLORS.cloud)
  }
  return finish(ctx)
}

// ---------------------------------------------------------------------------
// Field map — one polar painting that replaces the stack of tinted discs
// ---------------------------------------------------------------------------

/** Field map resolution and the world patch it covers (ft). */
export const FIELD_MAP_PX = 2048
export const FIELD_MAP_FT = 640
/** World Z of the plane centre; the plate sits 320 ft toward +Z from the far edge. */
export const FIELD_MAP_CENTER_Z = -260

const PPF = FIELD_MAP_PX / FIELD_MAP_FT // 3.2 px per ft
const MAP_HALF = FIELD_MAP_FT / 2
const PLATE_X = FIELD_MAP_PX / 2
const PLATE_Y = -(FIELD_MAP_CENTER_Z - MAP_HALF) * PPF

const mx = (x: number) => PLATE_X + x * PPF
const my = (z: number) => PLATE_Y + z * PPF
/** Polar → canvas. `deg` 0 = dead center (-Z), + = toward first base (+X). */
const pxAt = (deg: number, r: number) => mx(Math.sin(deg * DEG) * r)
const pyAt = (deg: number, r: number) => my(-Math.cos(deg * DEG) * r)
/** ctx.arc angle for a field bearing (canvas +x is world +X, canvas +y is world +Z). */
const arcAngle = (deg: number) => (deg - 90) * DEG

/** Outer boundary of mown grass: the wall arc in fair ground, tapering in foul ground. */
function boundaryR(deg: number): number {
  const a = Math.abs(deg)
  if (a <= FOUL_DEG) return fenceRadius(deg)
  const k = Math.min(1, (a - FOUL_DEG) / 18)
  return FENCE_LINE_FT + (300 - FENCE_LINE_FT) * k
}

function boundaryPath(ctx: Ctx) {
  ctx.beginPath()
  for (let deg = -180; deg <= 180; deg += 1.5) {
    const r = boundaryR(deg)
    const x = pxAt(deg, r)
    const y = pyAt(deg, r)
    if (deg <= -180) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
}

const BASES_2D: [number, number][] = [
  [0, 0],
  [63.6, -63.6],
  [0, -127.3],
  [-63.6, -63.6],
]

function diamondPath(ctx: Ctx, circumradius: number) {
  const cz = -63.6
  ctx.beginPath()
  for (let i = 0; i < 4; i++) {
    const bx = BASES_2D[i][0]
    const bz = BASES_2D[i][1]
    const dz = bz - cz
    const len = Math.hypot(bx, dz) || 1
    const x = mx((bx / len) * circumradius)
    const y = my(cz + (dz / len) * circumradius)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
}

function line(
  ctx: Ctx,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  widthFt: number,
  color: string,
) {
  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(1.2, widthFt * PPF)
  ctx.lineCap = 'butt'
  ctx.beginPath()
  ctx.moveTo(mx(x0), my(z0))
  ctx.lineTo(mx(x1), my(z1))
  ctx.stroke()
}

function rectFt(
  ctx: Ctx,
  cx: number,
  cz: number,
  wFt: number,
  dFt: number,
  widthFt: number,
  color: string,
) {
  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(1.2, widthFt * PPF)
  ctx.strokeRect(mx(cx - wFt / 2), my(cz - dFt / 2), wFt * PPF, dFt * PPF)
}

/**
 * The whole ground plane in one texture: mow fan, clay infield, infield grass
 * diamond, base paths, chalk, warning track. One-time cost, one draw call.
 */
export function fieldMapTexture(): CanvasTexture {
  const ctx = makeCtx(FIELD_MAP_PX, FIELD_MAP_PX)
  if (!ctx) return finish(ctx)

  // 1. everything starts as the far outfield rim colour
  ctx.fillStyle = COLORS.outfieldRim
  ctx.fillRect(0, 0, FIELD_MAP_PX, FIELD_MAP_PX)

  // 2. mowing stripes: 48 wedges of 7.5 deg fanned from the plate
  const R = 760 * PPF
  for (let i = 0; i < 48; i++) {
    const a0 = i * 7.5
    ctx.fillStyle = i % 2 === 0 ? COLORS.grassLight : COLORS.grassDark
    ctx.beginPath()
    ctx.moveTo(PLATE_X, PLATE_Y)
    ctx.arc(PLATE_X, PLATE_Y, R, arcAngle(a0), arcAngle(a0 + 7.5))
    ctx.closePath()
    ctx.fill()
  }

  // 3. six concentric rings at 4% multiply to break up the wedges
  ctx.save()
  ctx.globalCompositeOperation = 'multiply'
  ctx.strokeStyle = 'rgba(0,0,0,0.04)'
  for (let i = 1; i <= 6; i++) {
    ctx.lineWidth = 31 * PPF
    ctx.beginPath()
    ctx.arc(PLATE_X, PLATE_Y, i * 62 * PPF, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()

  // 4. clip the grass back to the park boundary (fills everything outside it)
  ctx.save()
  ctx.fillStyle = COLORS.outfieldRim
  ctx.beginPath()
  ctx.rect(0, 0, FIELD_MAP_PX, FIELD_MAP_PX)
  for (let deg = -180; deg <= 180; deg += 1.5) {
    const r = boundaryR(deg)
    const x = pxAt(deg, r)
    const y = pyAt(deg, r)
    if (deg <= -180) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.fill('evenodd')
  ctx.restore()

  // 5. warning track: 15-ft band just inside the boundary, feathered on the grass side
  ctx.save()
  boundaryPath(ctx)
  ctx.clip()
  ctx.strokeStyle = COLORS.warningTrack
  ctx.lineWidth = 30 * PPF // outer half is clipped away
  boundaryPath(ctx)
  ctx.stroke()
  ctx.globalAlpha = 0.45
  ctx.lineWidth = 36 * PPF
  boundaryPath(ctx)
  ctx.stroke()
  ctx.restore()

  // 6. clay infield, r = 95 ft, with a feathered edge so there is no polygonal rim
  ctx.fillStyle = COLORS.clay
  ctx.beginPath()
  ctx.arc(PLATE_X, PLATE_Y, 90.5 * PPF, 0, Math.PI * 2)
  ctx.fill()
  const clayGrad = ctx.createRadialGradient(
    PLATE_X,
    PLATE_Y,
    90 * PPF,
    PLATE_X,
    PLATE_Y,
    95 * PPF,
  )
  clayGrad.addColorStop(0, COLORS.clay)
  clayGrad.addColorStop(1, 'rgba(192,139,85,0)')
  ctx.fillStyle = clayGrad
  ctx.beginPath()
  ctx.arc(PLATE_X, PLATE_Y, 95 * PPF, 0, Math.PI * 2)
  ctx.fill()

  // 7. infield grass diamond (inset ~13 ft from the base paths)
  ctx.fillStyle = COLORS.grassLight
  diamondPath(ctx, 45.2)
  ctx.fill()
  ctx.save()
  ctx.globalCompositeOperation = 'multiply'
  ctx.fillStyle = 'rgba(0,0,0,0.05)'
  diamondPath(ctx, 45.2)
  ctx.fill()
  ctx.restore()

  // 8. base paths: 6-ft clay bands around the diamond + a mound apron
  for (let i = 0; i < 4; i++) {
    const a = BASES_2D[i]
    const b = BASES_2D[(i + 1) % 4]
    line(ctx, a[0], a[1], b[0], b[1], 6, COLORS.clayDark)
  }
  ctx.fillStyle = COLORS.clayDark
  ctx.beginPath()
  ctx.arc(mx(0), my(-60.5), 10.5 * PPF, 0, Math.PI * 2)
  ctx.fill()

  // 9. on-deck circles
  for (const x of [-26, 26]) {
    ctx.beginPath()
    ctx.arc(mx(x), my(18), 5 * PPF, 0, Math.PI * 2)
    ctx.fill()
  }

  // 10. chalk: foul lines out to 330 ft, batter's boxes, catcher's box
  for (const sign of [-1, 1]) {
    const deg = sign * FOUL_DEG
    line(
      ctx,
      0,
      0,
      Math.sin(deg * DEG) * FENCE_LINE_FT,
      -Math.cos(deg * DEG) * FENCE_LINE_FT,
      0.42,
      COLORS.chalk,
    )
  }
  for (const x of [-2.83, 2.83]) rectFt(ctx, x, 0.5, 4, 6, 0.32, COLORS.chalk)
  rectFt(ctx, 0, 5.2, 3.58, 8, 0.32, COLORS.chalk)

  return finish(ctx)
}

// ---------------------------------------------------------------------------
// Structure
// ---------------------------------------------------------------------------

/** 256 x 128 bleacher rows + a hashed (deterministic) crowd speckle. */
export function bleacherTexture(): CanvasTexture {
  const ctx = makeCtx(256, 128)
  if (ctx) {
    ctx.fillStyle = COLORS.bleacher
    ctx.fillRect(0, 0, 256, 128)
    const rowH = 128 / 12
    for (let row = 0; row < 12; row++) {
      const y = row * rowH
      ctx.fillStyle = row % 2 === 0 ? COLORS.bleacherShadow : COLORS.bleacher
      ctx.fillRect(0, y, 256, rowH - 1)
      ctx.fillStyle = 'rgba(0,0,0,0.12)'
      ctx.fillRect(0, y + rowH - 2, 256, 2)
    }
    for (let i = 0; i < 560; i++) {
      const h1 = hash01(i * 3 + 1)
      const h2 = hash01(i * 3 + 2)
      const h3 = hash01(i * 3 + 3)
      if (h3 < 0.35) continue
      ctx.fillStyle = h3 > 0.72 ? COLORS.crowd : COLORS.bleacherShadow
      ctx.beginPath()
      ctx.arc(h1 * 256, h2 * 116 + 6, 2.4, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = 'rgba(20,32,28,0.32)'
    ctx.fillRect(0, 0, 256, 9)
  }
  return finish(ctx, { wrap: true })
}

/** 256 x 128 white distance number on transparent, for the wall markers. */
export function distanceMarkerTexture(text: string): CanvasTexture {
  const ctx = makeCtx(256, 128)
  if (ctx) {
    ctx.clearRect(0, 0, 256, 128)
    ctx.fillStyle = COLORS.chalk
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    let size = 104
    ctx.font = `bold ${size}px Impact, "Arial Black", system-ui, sans-serif`
    while (size > 40 && ctx.measureText(text).width > 224) {
      size -= 6
      ctx.font = `bold ${size}px Impact, "Arial Black", system-ui, sans-serif`
    }
    ctx.fillText(text, 128, 66)
  }
  return finish(ctx)
}

/** 128 x 128 chest number on transparent (jersey dressing). */
export function jerseyNumberTexture(text: string, color: string): CanvasTexture {
  const ctx = makeCtx(128, 128)
  if (ctx) {
    ctx.clearRect(0, 0, 128, 128)
    ctx.fillStyle = color
    ctx.font = 'bold 88px Impact, "Arial Black", system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 64, 66)
  }
  return finish(ctx)
}

/** 32 x 256 gradient so the bat barrel catches the sun along its length. */
export function batGradientTexture(): CanvasTexture {
  const ctx = makeCtx(32, 256)
  if (ctx) {
    const g = ctx.createLinearGradient(0, 0, 32, 0)
    g.addColorStop(0, COLORS.batBarrelDark)
    g.addColorStop(0.42, COLORS.batBarrelLight)
    g.addColorStop(1, COLORS.batBarrelDark)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 32, 256)
  }
  return finish(ctx)
}

// ---------------------------------------------------------------------------
// Ball & FX
// ---------------------------------------------------------------------------

/** 128 x 128 ball skin: two red seam arcs on off-white, so spin reads statically. */
export function ballSeamTexture(): CanvasTexture {
  const ctx = makeCtx(128, 128)
  if (ctx) {
    ctx.fillStyle = COLORS.ball
    ctx.fillRect(0, 0, 128, 128)
    ctx.strokeStyle = COLORS.ballSeam
    ctx.lineCap = 'round'
    for (const cx of [30, 98]) {
      const bend = cx < 64 ? 22 : -22
      ctx.lineWidth = 5
      ctx.beginPath()
      for (let i = 0; i <= 24; i++) {
        const t = i / 24
        const x = cx + Math.sin(t * Math.PI) * bend
        const y = t * 128
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
      ctx.lineWidth = 2.2
      for (let i = 2; i < 24; i += 2) {
        const t = i / 24
        const x = cx + Math.sin(t * Math.PI) * bend
        const y = t * 128
        ctx.beginPath()
        ctx.moveTo(x - 5, y - 2)
        ctx.lineTo(x + 5, y + 2)
        ctx.stroke()
      }
    }
  }
  return finish(ctx)
}

/** 256 x 256 soft additive disc — ring glow, landing puff, fireworks. */
export function softDiscTexture(): CanvasTexture {
  const ctx = makeCtx(256, 256)
  if (ctx) {
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.35, 'rgba(255,255,255,0.62)')
    g.addColorStop(0.72, 'rgba(255,255,255,0.16)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 256, 256)
  }
  return finish(ctx)
}

/** 256 x 256 eight-point star flash for the contact burst. */
export function starTexture(): CanvasTexture {
  const ctx = makeCtx(256, 256)
  if (ctx) {
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 74)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.5, 'rgba(255,255,255,0.45)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 256, 256)
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.beginPath()
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2
      const r = i % 2 === 0 ? 126 : 34
      const x = 128 + Math.cos(a) * r
      const y = 128 + Math.sin(a) * r
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.fill()
  }
  return finish(ctx)
}

/** 128 x 128 radial alpha blob: baked contact shadow for figures outside the shadow map. */
export function shadowBlobTexture(): CanvasTexture {
  const ctx = makeCtx(128, 128)
  if (ctx) {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
    g.addColorStop(0, 'rgba(10,22,16,0.85)')
    g.addColorStop(0.55, 'rgba(10,22,16,0.4)')
    g.addColorStop(1, 'rgba(10,22,16,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 128, 128)
  }
  return finish(ctx)
}
