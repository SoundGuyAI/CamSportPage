import type { CommitHandler, InputPort, SwingCommit } from './types.ts'

/**
 * Stage 2 — webcam swing detection with **no ML model and no dependencies**.
 *
 * The camera frame is drawn mirrored into a tiny 64x48 canvas, converted to
 * grayscale, and compared against the previous frame. The share of pixels that
 * moved is the "motion energy" (0..1). A swing is a *big lateral burst*, so the
 * whole width is one zone (only the top ~15% of rows — the head — is skipped)
 * and a commit fires on the **onset** of motion, never on sustained motion.
 *
 * This module must stay DOM-free at import time: `scripts/check-camera.ts`
 * runs it under `node --experimental-strip-types` and drives synthetic frames
 * through the `frameSource` seam. DOM is only touched inside methods, and only
 * when a real video is used.
 */

// ------------------------------------------------------------------ constants

/** Downscaled motion grid. Small on purpose: cheap and noise-tolerant. */
export const CAM_W = 64
export const CAM_H = 48
/** Skip the top ~15% of rows — head bob is not a swing. */
export const SKIP_TOP_ROWS = Math.round(CAM_H * 0.15)
/** Pixels considered when computing energy (full width, below the head band). */
export const ZONE_PIXELS = (CAM_H - SKIP_TOP_ROWS) * CAM_W

export const EMA_FAST_ALPHA = 0.55
export const EMA_SLOW_ALPHA = 0.05
/** Fast EMA must exceed the slow EMA by this factor (kills slow drift/lighting). */
export const SLOW_RATIO = 1.55
/** Minimum gap between two commits. */
export const FIRE_DEBOUNCE_MS = 250
/** Ignore onsets right after start(): clicking "Start round" moves the player. */
export const START_GUARD_MS = 400
/** Re-arm once the fast EMA falls back under onsetThresh * this. */
export const REARM_FACTOR = 0.55

export const DEFAULT_SENSITIVITY = 0.6
export const SENSITIVITY_KEY = 'camsport.sensitivity'

// ------------------------------------------------------------------ tuning map

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)

/** Per-pixel grayscale delta that counts as "moved". Higher sensitivity = lower bar. */
export function pixThresholdFor(sensitivity: number): number {
  return Math.round(38 - 26 * clamp01(sensitivity))
}

/** Motion-energy level the fast EMA must cross to arm a commit. */
export function onsetThreshFor(sensitivity: number): number {
  return 0.14 - 0.105 * clamp01(sensitivity)
}

/** Minimum per-frame *rise* of the fast EMA — this is what makes it an onset. */
export function riseMinFor(sensitivity: number): number {
  return onsetThreshFor(sensitivity) * 0.35
}

// ------------------------------------------------------------------ public API

export type CameraStatus = 'idle' | 'requesting' | 'ready' | 'denied' | 'unavailable'

export type CameraState = {
  status: CameraStatus
  error?: string
  /** Raw motion energy of the last processed frame, 0..1. */
  energy: number
  emaFast: number
  onsetThresh: number
  armed: boolean
  /** performance.now() of the last emitted commit (0 = never). */
  lastFireMs: number
}

export type CameraStateHandler = (state: CameraState) => void

/**
 * Test seam: fill `dst` (CAM_W * CAM_H grayscale bytes, already mirrored) and
 * return true if a frame was produced.
 */
export type FrameSource = (dst: Uint8Array) => boolean

export type CameraInputOptions = {
  /** 0..1; defaults to the persisted value, else {@link DEFAULT_SENSITIVITY}. */
  sensitivity?: number
  /** Commits are stamped `performance.now() - leadMs` to offset detection lag. */
  leadMs?: number
  /** Supply a video element instead of letting CameraInput create one. */
  video?: HTMLVideoElement
  /** Bypass the camera entirely (tests / synthetic frames). */
  frameSource?: FrameSource
}

type RvfcVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number) => void) => number
  cancelVideoFrameCallback?: (handle: number) => void
}

const STATE_THROTTLE_MS = 66 // ~15 Hz

export class CameraInput implements InputPort {
  // --- subscribers
  private handlers = new Set<CommitHandler>()
  private stateHandlers = new Set<CameraStateHandler>()

  // --- config
  private sensitivity: number
  private readonly leadMs: number
  private pixThreshold: number
  private onsetThresh: number
  private riseMin: number

  // --- motion buffers (preallocated; swapped, never reallocated)
  private bufA = new Uint8Array(CAM_W * CAM_H)
  private bufB = new Uint8Array(CAM_W * CAM_H)
  private cur: Uint8Array
  private prev: Uint8Array
  private mask = new Uint8Array(CAM_W * CAM_H)
  private hasPrev = false

  // --- detector state
  private energy = 0
  private emaFast = 0
  private emaSlow = 0
  private armed = true
  private lastFireMs = 0
  private startedAtMs = 0

  // --- lifecycle
  private active = false
  private disposed = false
  private status: CameraStatus = 'idle'
  private error: string | undefined
  private stream: MediaStream | null = null
  private acquiring: Promise<void> | null = null

  // --- DOM (created lazily, never at module load)
  private readonly frameSource: FrameSource | null
  private video: RvfcVideo | null
  private ownsVideo = false
  private workCtx: CanvasRenderingContext2D | null = null
  private preview: HTMLCanvasElement | null = null
  private previewCtx: CanvasRenderingContext2D | null = null
  private overlay: HTMLCanvasElement | null = null
  private overlayCtx: CanvasRenderingContext2D | null = null
  private overlayData: ImageData | null = null
  private rafHandle = 0
  private rvfcHandle = 0
  private lastStatePublishMs = 0
  private lastPublishedEmaFast = -1

  constructor(options: CameraInputOptions = {}) {
    this.cur = this.bufA
    this.prev = this.bufB
    this.sensitivity = clamp01(options.sensitivity ?? loadSensitivity())
    this.leadMs = options.leadMs ?? 0
    this.frameSource = options.frameSource ?? null
    this.video = (options.video as RvfcVideo | undefined) ?? null
    this.pixThreshold = pixThresholdFor(this.sensitivity)
    this.onsetThresh = onsetThreshFor(this.sensitivity)
    this.riseMin = riseMinFor(this.sensitivity)
  }

  // ---------------------------------------------------------------- InputPort

  /**
   * Arms the detector and (first call) acquires the camera. Cheap to repeat:
   * GameSession calls start() on every round, and the MediaStream is kept
   * alive across stop()/start(). Only {@link dispose} releases the camera.
   */
  start(): void {
    if (this.disposed || this.active) return
    this.active = true
    this.startedAtMs = this.now()
    // Fresh baseline: the first frame after a gap must not read as motion.
    this.hasPrev = false
    this.energy = 0
    this.emaFast = 0
    this.emaSlow = 0
    this.armed = true

    if (this.frameSource) {
      this.setStatus('ready')
      this.startLoop()
      return
    }
    if (this.stream) {
      this.setStatus('ready')
      this.startLoop()
      return
    }
    this.acquire()
  }

  /** Idempotent. Keeps the camera stream so the next round starts instantly. */
  stop(): void {
    if (!this.active) return
    this.active = false
    this.stopLoop()
    this.publishState(true)
  }

  onCommit(handler: CommitHandler): () => void {
    this.handlers.add(handler)
    return () => {
      this.handlers.delete(handler)
    }
  }

  // ------------------------------------------------------------- extra public

  /** Really releases the camera. Call on unmount / when leaving webcam mode. */
  dispose(): void {
    this.disposed = true
    this.active = false
    this.stopLoop()
    this.releaseStream()
    if (this.video) {
      try {
        this.video.srcObject = null
      } catch {
        /* detached element */
      }
      if (this.ownsVideo) this.video = null
    }
    this.preview = null
    this.previewCtx = null
    this.handlers.clear()
    this.setStatus('idle')
    this.stateHandlers.clear()
  }

  setSensitivity(sensitivity: number): void {
    this.sensitivity = clamp01(sensitivity)
    this.pixThreshold = pixThresholdFor(this.sensitivity)
    this.onsetThresh = onsetThreshFor(this.sensitivity)
    this.riseMin = riseMinFor(this.sensitivity)
    writeStoredSensitivity(this.sensitivity)
    this.publishState(true)
  }

  getSensitivity(): number {
    return this.sensitivity
  }

  /** UI feed. Emits immediately, then throttled to ~15 Hz / on material change. */
  subscribeState(handler: CameraStateHandler): () => void {
    this.stateHandlers.add(handler)
    handler(this.snapshotState())
    return () => {
      this.stateHandlers.delete(handler)
    }
  }

  getState(): CameraState {
    return this.snapshotState()
  }

  /** Live mirrored preview for the UI's own `<video>` element. */
  getStream(): MediaStream | null {
    return this.stream
  }

  /** Paint the 64x48 motion mask (mirrored, green) into `canvas`. */
  attachPreview(canvas: HTMLCanvasElement | null): void {
    this.preview = canvas
    this.previewCtx = null
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false
    this.previewCtx = ctx
  }

  /**
   * Process exactly one frame. The production loop calls this via
   * requestVideoFrameCallback / requestAnimationFrame; tests call it directly
   * after staging a synthetic frame in their `frameSource`.
   */
  pump(): boolean {
    if (!this.active || this.disposed) return false
    if (!this.fillCurrent()) return false
    this.analyse()
    return true
  }

  // ---------------------------------------------------------------- internals

  private now(): number {
    return performance.now()
  }

  private setStatus(status: CameraStatus, error?: string): void {
    if (this.status === status && this.error === error) return
    this.status = status
    this.error = error
    this.publishState(true)
  }

  private snapshotState(): CameraState {
    return {
      status: this.status,
      error: this.error,
      energy: this.energy,
      emaFast: this.emaFast,
      onsetThresh: this.onsetThresh,
      armed: this.armed,
      lastFireMs: this.lastFireMs,
    }
  }

  private publishState(force: boolean): void {
    if (this.stateHandlers.size === 0) return
    const t = this.now()
    const material = force || Math.abs(this.emaFast - this.lastPublishedEmaFast) > 0.004
    if (!material) return
    if (!force && t - this.lastStatePublishMs < STATE_THROTTLE_MS) return
    this.lastStatePublishMs = t
    this.lastPublishedEmaFast = this.emaFast
    const state = this.snapshotState()
    for (const handler of [...this.stateHandlers]) handler(state)
  }

  // --- camera acquisition

  private acquire(): void {
    if (this.acquiring) return
    const media = globalThis.navigator?.mediaDevices
    if (!media?.getUserMedia) {
      this.setStatus('unavailable', 'This browser has no camera API (needs HTTPS or localhost).')
      return
    }
    this.setStatus('requesting')
    this.acquiring = media
      .getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      })
      .then(async (stream) => {
        if (this.disposed) {
          for (const track of stream.getTracks()) track.stop()
          return
        }
        this.stream = stream
        await this.bindVideo(stream)
        this.setStatus('ready')
        // start() may have been followed by stop() while the prompt was open.
        if (this.active) {
          this.startedAtMs = this.now()
          this.hasPrev = false
          this.startLoop()
        }
      })
      .catch((err: unknown) => {
        const name = (err as { name?: string } | null)?.name ?? ''
        const message = (err as { message?: string } | null)?.message ?? String(err)
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          this.setStatus('denied', message)
        } else {
          this.setStatus('unavailable', message)
        }
      })
      .finally(() => {
        this.acquiring = null
      })
  }

  private async bindVideo(stream: MediaStream): Promise<void> {
    if (!this.video) {
      this.video = globalThis.document.createElement('video') as RvfcVideo
      this.ownsVideo = true
    }
    const video = this.video
    video.muted = true
    video.autoplay = true
    video.setAttribute('playsinline', '')
    video.srcObject = stream
    try {
      await video.play()
    } catch {
      // Autoplay of a muted, user-initiated stream should not fail; if it does
      // the frame loop simply reads zeroed frames until it does play.
    }
  }

  private releaseStream(): void {
    if (!this.stream) return
    for (const track of this.stream.getTracks()) track.stop()
    this.stream = null
  }

  // --- frame loop

  private startLoop(): void {
    this.stopLoop()
    const video = this.video
    if (video?.requestVideoFrameCallback) {
      const tick = (): void => {
        if (!this.active) return
        this.pump()
        if (!this.active) return
        this.rvfcHandle = video.requestVideoFrameCallback!(tick)
      }
      this.rvfcHandle = video.requestVideoFrameCallback(tick)
      return
    }
    const raf = globalThis.requestAnimationFrame
    if (typeof raf !== 'function') return // node / test: driven by pump()
    const tick = (): void => {
      if (!this.active) return
      this.pump()
      if (!this.active) return
      this.rafHandle = raf(tick)
    }
    this.rafHandle = raf(tick)
  }

  private stopLoop(): void {
    if (this.rafHandle && typeof globalThis.cancelAnimationFrame === 'function') {
      globalThis.cancelAnimationFrame(this.rafHandle)
    }
    this.rafHandle = 0
    if (this.rvfcHandle && this.video?.cancelVideoFrameCallback) {
      this.video.cancelVideoFrameCallback(this.rvfcHandle)
    }
    this.rvfcHandle = 0
  }

  /** Grayscale the (mirrored) frame into `this.cur`. */
  private fillCurrent(): boolean {
    if (this.frameSource) return this.frameSource(this.cur)

    const video = this.video
    if (!video || video.readyState < 2 || video.videoWidth === 0) return false
    if (!this.workCtx) {
      const canvas = globalThis.document.createElement('canvas')
      canvas.width = CAM_W
      canvas.height = CAM_H
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return false
      // Mirror once, here: every downstream buffer is already mirrored.
      ctx.translate(CAM_W, 0)
      ctx.scale(-1, 1)
      ctx.imageSmoothingEnabled = true
      this.workCtx = ctx
    }
    this.workCtx.drawImage(video, 0, 0, CAM_W, CAM_H)
    // getImageData allocates; it is the only per-frame allocation and the
    // only way to read pixels from a 2D context. Everything downstream reuses
    // preallocated buffers.
    const rgba = this.workCtx.getImageData(0, 0, CAM_W, CAM_H).data
    const dst = this.cur
    for (let i = 0, p = 0; i < dst.length; i++, p += 4) {
      dst[i] = (rgba[p] * 77 + rgba[p + 1] * 151 + rgba[p + 2] * 28) >> 8
    }
    return true
  }

  /** Diff, smooth, decide — no allocations. */
  private analyse(): void {
    const cur = this.cur
    const prev = this.prev
    if (!this.hasPrev) {
      this.hasPrev = true
      this.swap()
      return
    }

    const start = SKIP_TOP_ROWS * CAM_W
    const end = cur.length
    const threshold = this.pixThreshold
    const mask = this.mask
    let moved = 0
    for (let i = start; i < end; i++) {
      const d = cur[i] - prev[i]
      if ((d < 0 ? -d : d) > threshold) {
        moved++
        mask[i] = 1
      } else {
        mask[i] = 0
      }
    }

    this.energy = moved / ZONE_PIXELS
    const emaPrev = this.emaFast
    this.emaFast += EMA_FAST_ALPHA * (this.energy - this.emaFast)
    this.emaSlow += EMA_SLOW_ALPHA * (this.energy - this.emaSlow)

    const now = this.now()
    const onset = this.onsetThresh
    if (
      this.armed &&
      this.emaFast > onset &&
      this.emaFast - emaPrev > this.riseMin &&
      this.emaFast > this.emaSlow * SLOW_RATIO &&
      now - this.lastFireMs > FIRE_DEBOUNCE_MS
    ) {
      this.armed = false
      if (now - this.startedAtMs >= START_GUARD_MS) {
        this.lastFireMs = now
        this.fire(now)
      }
    } else if (!this.armed && this.emaFast < onset * REARM_FACTOR) {
      this.armed = true
    }

    this.swap()
    this.paintPreview()
    this.publishState(false)
  }

  private swap(): void {
    const next = this.cur === this.bufA ? this.bufB : this.bufA
    this.prev = this.cur
    this.cur = next
  }

  private fire(now: number): void {
    const commit: SwingCommit = {
      atMs: now - this.leadMs,
      source: 'camera',
      power: clamp01(this.emaFast / (this.onsetThresh * 3)),
    }
    for (const handler of [...this.handlers]) handler(commit)
    this.publishState(true)
  }

  private paintPreview(): void {
    const target = this.previewCtx
    const canvas = this.preview
    if (!target || !canvas) return
    if (!this.overlayCtx) {
      const off = globalThis.document.createElement('canvas')
      off.width = CAM_W
      off.height = CAM_H
      const ctx = off.getContext('2d', { willReadFrequently: true })
      if (!ctx) return
      this.overlay = off
      this.overlayCtx = ctx
      this.overlayData = ctx.createImageData(CAM_W, CAM_H)
    }
    const data = this.overlayData!.data
    const mask = this.mask
    for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
      if (mask[i]) {
        data[p] = 90
        data[p + 1] = 255
        data[p + 2] = 150
        data[p + 3] = 130
      } else {
        data[p + 3] = 0
      }
    }
    this.overlayCtx.putImageData(this.overlayData!, 0, 0)
    target.imageSmoothingEnabled = false
    target.clearRect(0, 0, canvas.width, canvas.height)
    target.drawImage(this.overlay!, 0, 0, canvas.width, canvas.height)
  }
}

// ------------------------------------------------------------------ storage

/** Persisted sensitivity (0..1), or the default. Safe without localStorage. */
export function loadSensitivity(): number {
  try {
    const raw = globalThis.localStorage?.getItem(SENSITIVITY_KEY)
    if (raw == null) return DEFAULT_SENSITIVITY
    const value = Number.parseFloat(raw)
    return Number.isFinite(value) ? clamp01(value) : DEFAULT_SENSITIVITY
  } catch {
    return DEFAULT_SENSITIVITY
  }
}

function writeStoredSensitivity(value: number): void {
  try {
    globalThis.localStorage?.setItem(SENSITIVITY_KEY, String(value))
  } catch {
    /* private mode / no storage — sensitivity just won't persist */
  }
}
