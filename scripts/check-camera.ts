/**
 * Runnable smoke checks for the webcam (frame-difference) input — no test
 * runner, no DOM, no camera. Run with:
 *
 *   node --experimental-strip-types scripts/check-camera.ts
 *
 * Synthetic grayscale frames are pushed through CameraInput's `frameSource`
 * seam and the frame loop is driven by hand via `pump()`.
 */
import {
  CameraInput,
  CAM_H,
  CAM_W,
  DEFAULT_SENSITIVITY,
  FIRE_DEBOUNCE_MS,
  SKIP_TOP_ROWS,
  START_GUARD_MS,
  ZONE_PIXELS,
  onsetThreshFor,
  pixThresholdFor,
  riseMinFor,
  type CameraState,
  type FrameSource,
} from '../src/input/CameraInput.ts'
import { CompositeInput } from '../src/input/CompositeInput.ts'
import type { CommitHandler, InputPort, SwingCommit } from '../src/input/types.ts'

let passed = 0
const failures: string[] = []

function check(name: string, cond: boolean, detail = ''): void {
  if (cond) passed += 1
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
}

function eq<T>(name: string, actual: T, expected: T): void {
  check(name, Object.is(actual, expected), `expected ${String(expected)}, got ${String(actual)}`)
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

// ------------------------------------------------------------------ tuning map
{
  eq('pixThreshold @0', pixThresholdFor(0), 38)
  eq('pixThreshold @1', pixThresholdFor(1), 12)
  eq('pixThreshold @0.6', pixThresholdFor(0.6), 22)
  check('onsetThresh @0', Math.abs(onsetThreshFor(0) - 0.14) < 1e-9, `${onsetThreshFor(0)}`)
  check('onsetThresh @1', Math.abs(onsetThreshFor(1) - 0.035) < 1e-9, `${onsetThreshFor(1)}`)
  check(
    'onsetThresh falls with sensitivity',
    onsetThreshFor(0.2) > onsetThreshFor(0.8),
    `${onsetThreshFor(0.2)} vs ${onsetThreshFor(0.8)}`,
  )
  check(
    'riseMin = 35% of onset',
    Math.abs(riseMinFor(0.6) - onsetThreshFor(0.6) * 0.35) < 1e-12,
  )
  eq('grid 64x48', `${CAM_W}x${CAM_H}`, '64x48')
  eq('head band skipped', SKIP_TOP_ROWS, 7)
  eq('zone pixels = full width below head', ZONE_PIXELS, (48 - 7) * 64)
  eq('default sensitivity', DEFAULT_SENSITIVITY, 0.6)
}

// ------------------------------------------------------------------ harness

/** A staged frame + the fake camera that serves it. */
function harness(options: { sensitivity?: number; leadMs?: number } = {}) {
  const frame = new Uint8Array(CAM_W * CAM_H).fill(100)
  let available = true
  const frameSource: FrameSource = (dst) => {
    if (!available) return false
    dst.set(frame)
    return true
  }
  const input = new CameraInput({
    sensitivity: options.sensitivity ?? DEFAULT_SENSITIVITY,
    leadMs: options.leadMs ?? 0,
    frameSource,
  })
  const commits: SwingCommit[] = []
  input.onCommit((c) => commits.push(c))

  /** Paint the whole zone (below the head band) to `value`. */
  const paintZone = (value: number): void => {
    frame.fill(value, SKIP_TOP_ROWS * CAM_W)
  }
  /** Paint only the head band — must never count as motion. */
  const paintHead = (value: number): void => {
    frame.fill(value, 0, SKIP_TOP_ROWS * CAM_W)
  }
  const pumpN = (n: number): void => {
    for (let i = 0; i < n; i++) input.pump()
  }
  /** Quiet frames until the detector re-arms (identical frames = zero energy). */
  const quiet = (n = 12): void => {
    pumpN(n)
  }
  /** One frame of big lateral change. */
  const burst = (): void => {
    paintZone(frame[SKIP_TOP_ROWS * CAM_W] > 128 ? 20 : 230)
    input.pump()
  }

  return {
    input,
    commits,
    paintZone,
    paintHead,
    pumpN,
    quiet,
    burst,
    setAvailable: (v: boolean) => {
      available = v
    },
  }
}

// ------------------------------------------------------------------ detector
{
  const h = harness()
  eq('status idle before start', h.input.getState().status, 'idle')
  h.input.start()
  eq('status ready with a frameSource', h.input.getState().status, 'ready')
  eq('no stream without a camera', h.input.getStream(), null)

  // --- start guard: a burst inside the first 400 ms is swallowed (the click
  //     on "Start round" moves the player in front of the camera).
  h.pumpN(2)
  h.burst()
  h.burst()
  eq('burst inside start guard emits nothing', h.commits.length, 0)
  h.quiet(20)

  await sleep(START_GUARD_MS + 40)

  // --- static scene: nothing at all
  h.pumpN(30)
  eq('static scene emits nothing', h.commits.length, 0)
  check('static energy is zero', h.input.getState().energy === 0)
  eq('armed while static', h.input.getState().armed, true)

  // --- head-only motion is ignored (top 15% of rows are skipped)
  for (let i = 0; i < 6; i++) {
    h.paintHead(i % 2 === 0 ? 10 : 250)
    h.input.pump()
  }
  eq('head-band motion emits nothing', h.commits.length, 0)
  eq('head-band motion reads zero energy', h.input.getState().energy, 0)

  // --- one swing => exactly one commit
  h.burst()
  eq('swing onset emits one commit', h.commits.length, 1)
  eq('commit source', h.commits[0]?.source, 'camera')
  const power = h.commits[0]?.power ?? -1
  check('power in 0..1', power > 0 && power <= 1, `${power}`)
  eq('disarmed after firing', h.input.getState().armed, false)
  check('lastFireMs recorded', h.input.getState().lastFireMs > 0)

  // --- sustained motion must NOT fire again (onset, not level)
  for (let i = 0; i < 25; i++) h.burst()
  eq('sustained motion emits no second commit', h.commits.length, 1)
  eq('still disarmed while moving', h.input.getState().armed, false)

  // --- debounce: re-armed by a quiet patch, but still inside 250 ms
  h.quiet(20)
  eq('re-armed once quiet', h.input.getState().armed, true)
  h.burst()
  eq('debounce blocks a fire within 250 ms', h.commits.length, 1)

  // --- after the debounce window a fresh burst fires again
  h.quiet(40)
  await sleep(FIRE_DEBOUNCE_MS + 60)
  h.quiet(10)
  h.burst()
  eq('new burst after quiet + debounce emits again', h.commits.length, 2)
  check(
    'commits are >250ms apart',
    (h.commits[1]?.atMs ?? 0) - (h.commits[0]?.atMs ?? 0) > FIRE_DEBOUNCE_MS,
  )

  // --- stop() stops emitting, idempotently
  h.input.stop()
  h.input.stop()
  eq('pump after stop is a no-op', h.input.pump(), false)
  h.quiet(10)
  for (let i = 0; i < 20; i++) h.burst()
  eq('no commits after stop', h.commits.length, 2)

  // --- restart works and re-applies the start guard
  h.input.start()
  h.quiet(5)
  h.burst()
  h.burst()
  eq('restart re-arms the start guard', h.commits.length, 2)
  await sleep(START_GUARD_MS + 40)
  h.quiet(20)
  h.burst()
  eq('fires again after the guard expires', h.commits.length, 3)

  h.input.dispose()
  h.input.start()
  eq('disposed instance never restarts', h.input.getState().status, 'idle')
}

// ------------------------------------------------------------------ leadMs
{
  const h = harness({ leadMs: 120 })
  h.input.start()
  h.quiet(5)
  await sleep(START_GUARD_MS + 40)
  h.quiet(5)
  const before = performance.now()
  h.burst()
  eq('leadMs: one commit', h.commits.length, 1)
  const atMs = h.commits[0]?.atMs ?? 0
  check('leadMs shifts the stamp earlier', atMs <= before - 100, `${before - atMs} ms before now`)
  h.input.dispose()
}

// ------------------------------------------------------------------ frameSource gaps
{
  const h = harness()
  h.input.start()
  h.setAvailable(false)
  eq('pump with no frame available', h.input.pump(), false)
  h.setAvailable(true)
  await sleep(START_GUARD_MS + 40)
  h.quiet(5)
  h.burst()
  eq('resumes once frames return', h.commits.length, 1)
  h.input.dispose()
}

// ------------------------------------------------------------------ sensitivity
{
  const h = harness({ sensitivity: 0.2 })
  eq('getSensitivity reflects the option', h.input.getSensitivity(), 0.2)
  h.input.setSensitivity(0.9)
  eq('setSensitivity applies', h.input.getSensitivity(), 0.9)
  h.input.setSensitivity(5)
  eq('setSensitivity clamps high', h.input.getSensitivity(), 1)
  h.input.setSensitivity(-3)
  eq('setSensitivity clamps low', h.input.getSensitivity(), 0)
  check(
    'state onsetThresh tracks sensitivity',
    Math.abs(h.input.getState().onsetThresh - onsetThreshFor(0)) < 1e-9,
  )
  h.input.dispose()
}

// ------------------------------------------------------------------ state feed
{
  const h = harness()
  const seen: CameraState[] = []
  const unsub = h.input.subscribeState((s) => seen.push(s))
  eq('subscribeState emits immediately', seen.length, 1)
  eq('first state is idle', seen[0]?.status, 'idle')
  h.input.start()
  check('status change is published', seen.some((s) => s.status === 'ready'))
  await sleep(START_GUARD_MS + 40)
  h.quiet(5)
  h.burst()
  check('fire is published', seen.some((s) => s.lastFireMs > 0))
  const count = seen.length
  unsub()
  h.quiet(30)
  eq('unsubscribed state handler goes quiet', seen.length, count)
  h.input.dispose()
}

// ------------------------------------------------------------------ composite
{
  class Fake implements InputPort {
    started = 0
    stopped = 0
    handlers = new Set<CommitHandler>()
    start(): void {
      this.started += 1
    }
    stop(): void {
      this.stopped += 1
    }
    onCommit(handler: CommitHandler): () => void {
      this.handlers.add(handler)
      return () => {
        this.handlers.delete(handler)
      }
    }
    emit(): void {
      for (const h of [...this.handlers]) h({ atMs: 1, source: 'pointer', power: 1 })
    }
  }
  const a = new Fake()
  const b = new Fake()
  const composite = new CompositeInput([a, b])
  const got: SwingCommit[] = []
  const unsub = composite.onCommit((c) => got.push(c))
  composite.start()
  eq('composite starts child a', a.started, 1)
  eq('composite starts child b', b.started, 1)
  a.emit()
  b.emit()
  eq('composite forwards both children', got.length, 2)
  unsub()
  eq('composite unsubscribes a', a.handlers.size, 0)
  eq('composite unsubscribes b', b.handlers.size, 0)
  a.emit()
  eq('no commits after unsubscribe', got.length, 2)
  composite.stop()
  eq('composite stops child a', a.stopped, 1)
  eq('composite stops child b', b.stopped, 1)
}

// ------------------------------------------------------------------ report
const total = passed + failures.length
if (failures.length > 0) {
  console.error(`check-camera: ${passed}/${total} passed, ${failures.length} FAILED`)
  for (const f of failures) console.error(`  x ${f}`)
  process.exit(1)
}
console.log(`check-camera: ${passed}/${total} checks passed`)
