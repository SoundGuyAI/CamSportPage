/**
 * Runnable smoke checks for the game core — no test runner, no package.json
 * changes. Run with:
 *
 *   node --experimental-strip-types scripts/check-game.ts
 *
 * Only imports from src/game + src/input/types (no DOM, no import.meta).
 */
import type { CommitHandler, InputPort, SwingCommit } from '../src/input/types.ts'
import { gradeSwing, DEFAULT_WINDOWS } from '../src/game/timing.ts'
import { resolveOutcome, describeResult, FOUL_DEG } from '../src/game/outcome.ts'
import { pointsForResult, pointsForBand, sumScore } from '../src/game/scoring.ts'
import {
  GameSession,
  PITCH_FLIGHT_MS,
  PRE_PITCH_DELAY_MS,
  RESULT_HOLD_MS,
  WHIFF_HOLD_MS,
  type Scheduler,
  type SessionSnapshot,
} from '../src/game/GameSession.ts'

let passed = 0
const failures: string[] = []

function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    passed += 1
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function eq<T>(name: string, actual: T, expected: T): void {
  check(name, Object.is(actual, expected), `expected ${String(expected)}, got ${String(actual)}`)
}

// ---------------------------------------------------------------- fakes

class FakeClock implements Scheduler {
  private t = 1000
  private seq = 1
  private pending = new Map<number, { at: number; fn: () => void }>()

  now(): number {
    return this.t
  }

  setTimeout(fn: () => void, ms: number): number {
    const handle = this.seq++
    this.pending.set(handle, { at: this.t + ms, fn })
    return handle
  }

  clearTimeout(handle: number): void {
    this.pending.delete(handle)
  }

  get pendingCount(): number {
    return this.pending.size
  }

  /** Advance time, firing due timers in chronological order. */
  advance(ms: number): void {
    const target = this.t + ms
    for (;;) {
      let nextHandle = -1
      let nextAt = Infinity
      for (const [handle, timer] of this.pending) {
        if (timer.at <= target && timer.at < nextAt) {
          nextAt = timer.at
          nextHandle = handle
        }
      }
      if (nextHandle === -1) break
      const timer = this.pending.get(nextHandle)
      this.pending.delete(nextHandle)
      this.t = nextAt
      timer?.fn()
    }
    this.t = target
  }
}

class FakeInput implements InputPort {
  started = 0
  stopped = 0
  private handlers = new Set<CommitHandler>()

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

  emit(atMs: number): void {
    const commit: SwingCommit = { atMs, source: 'pointer', power: 1 }
    for (const handler of [...this.handlers]) handler(commit)
  }

  get listenerCount(): number {
    return this.handlers.size
  }
}

function newSession(totalPitches = 10) {
  const clock = new FakeClock()
  const input = new FakeInput()
  const session = new GameSession(input, totalPitches, DEFAULT_WINDOWS, clock)
  let snap: SessionSnapshot = session.snapshot()
  session.subscribe((s) => {
    snap = s
  })
  return { clock, input, session, get: () => snap }
}

// ---------------------------------------------------------------- timing
{
  const { perfectMs, contactMs } = DEFAULT_WINDOWS
  eq('grade: dead on = perfect', gradeSwing(1000, 1000), 'perfect')
  eq('grade: perfect edge (early)', gradeSwing(1000 - perfectMs, 1000), 'perfect')
  eq('grade: perfect edge (late)', gradeSwing(1000 + perfectMs, 1000), 'perfect')
  eq('grade: just early', gradeSwing(1000 - perfectMs - 1, 1000), 'early')
  eq('grade: just late', gradeSwing(1000 + perfectMs + 1, 1000), 'late')
  eq('grade: contact edge early', gradeSwing(1000 - contactMs, 1000), 'early')
  eq('grade: contact edge late', gradeSwing(1000 + contactMs, 1000), 'late')
  eq('grade: past contact = miss', gradeSwing(1000 + contactMs + 1, 1000), 'miss')
  eq('grade: way early = miss', gradeSwing(1000 - contactMs - 1, 1000), 'miss')
}

// ---------------------------------------------------------------- outcome
{
  for (let i = 0; i < 10; i++) {
    const a = JSON.stringify(resolveOutcome('early', -90, i))
    const b = JSON.stringify(resolveOutcome('early', -90, i))
    check(`outcome deterministic (pitch ${i})`, a === b)
  }
  check(
    'outcome varies by pitch index',
    new Set(Array.from({ length: 10 }, (_, i) => resolveOutcome('perfect', 0, i).distanceFt)).size >
      1,
  )

  const whiff = resolveOutcome('miss', null, 0)
  eq('miss -> whiff kind', whiff.kind, 'whiff')
  eq('miss -> not fair', whiff.fair, false)
  eq('miss -> 0 ft', whiff.distanceFt, 0)
  eq('miss -> 0 flight', whiff.flightMs, 0)

  let homers = 0
  for (let i = 0; i < 40; i++) {
    const o = resolveOutcome('perfect', 5, i)
    check(`perfect fair (${i})`, o.fair)
    check(
      `perfect distance 380-430 (${i})`,
      o.distanceFt >= 380 && o.distanceFt <= 430,
      `${o.distanceFt}`,
    )
    check(`perfect dir within 15 (${i})`, Math.abs(o.dirDeg) <= 15, `${o.dirDeg}`)
    check(`perfect launch 28-34 (${i})`, o.launchDeg >= 28 && o.launchDeg <= 34, `${o.launchDeg}`)
    eq(`perfect flight (${i})`, o.flightMs, 2200)
    check(`perfect kind (${i})`, o.kind === 'homer' || o.kind === 'deep')
    if (o.kind === 'homer') homers += 1
  }
  check('perfect is mostly homers', homers / 40 > 0.6, `${homers}/40`)

  for (let i = 0; i < 20; i++) {
    check(`early pulls left (${i})`, resolveOutcome('early', -70, i).dirDeg < 0)
    check(`late pushes right (${i})`, resolveOutcome('late', 70, i).dirDeg > 0)
  }

  for (let i = 0; i < 20; i++) {
    const veryEarly = resolveOutcome('early', -DEFAULT_WINDOWS.contactMs, i)
    const veryLate = resolveOutcome('late', DEFAULT_WINDOWS.contactMs, i)
    check(`very early is foul (${i})`, !veryEarly.fair && veryEarly.kind === 'foul')
    check(`very late is foul (${i})`, !veryLate.fair && veryLate.kind === 'foul')
    check(`very early beyond foul line (${i})`, Math.abs(veryEarly.dirDeg) > FOUL_DEG)

    const mild = resolveOutcome('early', -(DEFAULT_WINDOWS.perfectMs + 5), i)
    check(`mild early is fair (${i})`, mild.fair, `${mild.kind} ${mild.dirDeg}`)
    check(
      `mild early distance in band (${i})`,
      mild.distanceFt >= 150 && mild.distanceFt <= 320,
      `${mild.distanceFt}`,
    )
    check(
      `mild early kind (${i})`,
      mild.kind === 'liner' || mild.kind === 'grounder' || mild.kind === 'deep',
      mild.kind,
    )
    check(`fair mistimed has flight (${i})`, mild.flightMs > 0)
  }

  const near = Math.abs(resolveOutcome('late', 60, 3).dirDeg)
  const far = Math.abs(resolveOutcome('late', 135, 3).dirDeg)
  check('dirDeg grows with |delta|', far > near, `${near} -> ${far}`)
}

// ---------------------------------------------------------------- scoring
{
  eq('points: perfect', pointsForResult('perfect', resolveOutcome('perfect', 0, 0)), 100)
  eq('points: miss', pointsForResult('miss', resolveOutcome('miss', null, 0)), 0)
  eq('points: foul', pointsForResult('early', resolveOutcome('early', -140, 0)), 10)
  const fair = resolveOutcome('late', 60, 0)
  const pts = pointsForResult('late', fair)
  check('points: fair mistimed 40-60', pts >= 40 && pts <= 60, `${pts}`)
  eq('pointsForBand compat', pointsForBand('perfect'), 100)
  eq('sumScore compat', sumScore(['perfect', 'early', 'miss']), 140)
}

// ---------------------------------------------------------------- session: happy path
{
  const { clock, input, session, get } = newSession(10)
  eq('pre-start phase', get().phase, 'idle')
  eq('pre-start running', get().running, false)

  session.start()
  eq('input started', input.started, 1)
  eq('after start: still idle', get().phase, 'idle')
  eq('after start: running', get().running, true)
  eq('after start: no pitch yet', get().current, null)

  clock.advance(PRE_PITCH_DELAY_MS)
  eq('pitch released', get().phase, 'pitching')
  check('current pitch exists', get().current !== null)
  const pitch = get().current
  eq('pitch index 0', pitch?.index, 0)
  eq('contact = start + flight', (pitch?.contactAtMs ?? 0) - (pitch?.startedAtMs ?? 0), PITCH_FLIGHT_MS)

  clock.advance(PITCH_FLIGHT_MS)
  input.emit(clock.now())
  eq('after swing: result phase', get().phase, 'result')
  eq('one completed', get().completed.length, 1)
  eq('current cleared during result', get().current, null)
  const r0 = get().lastResult
  eq('band perfect', r0?.band, 'perfect')
  eq('deltaMs 0', r0?.deltaMs, 0)
  check('commit recorded', r0?.commit != null)
  eq('resolvedAtMs = now', r0?.resolvedAtMs, clock.now())
  eq('score 100', get().score, 100)
  eq('finished false', get().finished, false)
  check('describeResult perfect', (r0 ? describeResult(r0) : '').startsWith('PERFECT!'))

  input.emit(clock.now() + 10)
  eq('double commit during result ignored', get().completed.length, 1)

  clock.advance((r0?.outcome.flightMs ?? 0) + RESULT_HOLD_MS - 1)
  eq('still holding result', get().phase, 'result')
  clock.advance(1)
  eq('next pitch started', get().phase, 'pitching')
  eq('pitch index 1', get().current?.index, 1)

  session.stop()
}

// ---------------------------------------------------------------- session: timeout -> miss
{
  const { clock, input, session, get } = newSession(3)
  session.start()
  clock.advance(PRE_PITCH_DELAY_MS)
  eq('pitching', get().phase, 'pitching')

  clock.advance(PITCH_FLIGHT_MS + DEFAULT_WINDOWS.contactMs - 1)
  eq('not yet resolved', get().phase, 'pitching')
  clock.advance(1)
  eq('timed out -> result', get().phase, 'result')
  const r = get().lastResult
  eq('timeout band', r?.band, 'miss')
  eq('timeout commit null', r?.commit, null)
  eq('timeout delta null', r?.deltaMs, null)
  eq('timeout kind whiff', r?.outcome.kind, 'whiff')
  eq('timeout points', r?.points, 0)
  eq('timeout score', get().score, 0)
  eq('timeout text', r ? describeResult(r) : '', 'Miss — strike looking')

  clock.advance(WHIFF_HOLD_MS - 1)
  eq('still result during whiff hold', get().phase, 'result')
  clock.advance(1)
  eq('next pitch after whiff hold', get().phase, 'pitching')
  eq('exactly one result so far', get().completed.length, 1)

  // Swinging way too early (outside the contact window) => swinging strike.
  clock.advance(PITCH_FLIGHT_MS - DEFAULT_WINDOWS.contactMs - 10)
  input.emit(clock.now())
  const r2 = get().lastResult
  eq('early-beyond-window band', r2?.band, 'miss')
  check('swinging strike has commit', r2?.commit != null)
  eq('swinging strike text', r2 ? describeResult(r2) : '', 'Miss — swinging strike')

  session.stop()
}

// ---------------------------------------------------------------- session: stray commits
{
  const { clock, input, session, get } = newSession(2)
  session.start()
  input.emit(clock.now())
  eq('pre-pitch commit ignored', get().completed.length, 0)
  eq('still idle', get().phase, 'idle')

  clock.advance(PRE_PITCH_DELAY_MS + PITCH_FLIGHT_MS)
  input.emit(clock.now())
  input.emit(clock.now())
  input.emit(clock.now())
  eq('only one result per pitch', get().completed.length, 1)
  session.stop()
}

// ---------------------------------------------------------------- session: full round
{
  const { clock, input, session, get } = newSession(10)
  session.start()
  clock.advance(PRE_PITCH_DELAY_MS)

  for (let i = 0; i < 10; i++) {
    eq(`round pitch ${i} in flight`, get().phase, 'pitching')
    eq(`round pitch ${i} index`, get().current?.index, i)
    const contactAt = get().current?.contactAtMs ?? clock.now()
    clock.advance(contactAt - clock.now())
    const mode = i % 4
    if (mode === 0) input.emit(clock.now())
    else if (mode === 1) input.emit(clock.now() - 80)
    else if (mode === 2) input.emit(clock.now() + 80)
    // mode 3: let it time out

    // Step forward until this pitch resolves, then until the hold expires.
    for (let guard = 0; get().completed.length === i && guard < 2000; guard++) clock.advance(10)
    for (let guard = 0; get().phase === 'result' && guard < 2000; guard++) clock.advance(10)
    eq(`round pitch ${i} resolved`, get().completed.length, i + 1)
  }

  eq('10 results', get().completed.length, 10)
  eq('phase finished', get().phase, 'finished')
  eq('finished flag', get().finished, true)
  eq('running false after finish', get().running, false)
  eq('current null after finish', get().current, null)
  check('input stopped at end', input.stopped >= 1)
  eq('no listeners left on input', input.listenerCount, 0)
  eq('no pending timers after finish', clock.pendingCount, 0)
  eq(
    'score = sum of result points',
    get().score,
    get().completed.reduce((s, r) => s + r.points, 0),
  )
  check('score > 0', get().score > 0, `${get().score}`)
  eq('pitch indices in order', get().completed.map((r) => r.pitchIndex).join(','), '0,1,2,3,4,5,6,7,8,9')

  session.start()
  eq('restart clears results', get().completed.length, 0)
  eq('restart clears lastResult', get().lastResult, null)
  eq('restart running', get().running, true)
  eq('restart phase idle', get().phase, 'idle')
  session.stop()
}

// ---------------------------------------------------------------- session: stop() clears timers
{
  const { clock, input, session, get } = newSession(10)
  session.start()
  check('timer pending after start', clock.pendingCount > 0)
  clock.advance(PRE_PITCH_DELAY_MS)
  check('timeout timer pending during pitch', clock.pendingCount > 0)

  session.stop()
  eq('stop clears timers', clock.pendingCount, 0)
  eq('stop unsubscribes input', input.listenerCount, 0)
  eq('stop -> idle', get().phase, 'idle')
  eq('stop -> not running', get().running, false)
  eq('stop -> no current', get().current, null)

  clock.advance(60_000)
  eq('no pitch after stop', get().completed.length, 0)
  eq('still idle after advancing', get().phase, 'idle')

  session.stop()
  eq('double stop ok', get().phase, 'idle')
}

// ---------------------------------------------------------------- report
const total = passed + failures.length
if (failures.length > 0) {
  console.error(`check-game: ${passed}/${total} passed, ${failures.length} FAILED`)
  for (const f of failures) console.error(`  x ${f}`)
  process.exit(1)
}
console.log(`check-game: ${passed}/${total} checks passed`)
