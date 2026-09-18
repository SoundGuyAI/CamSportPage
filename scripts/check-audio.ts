/**
 * Runnable smoke checks for the audio cue mapper — no test runner, no
 * package.json changes, no Web Audio. Run with:
 *
 *   node --experimental-strip-types scripts/check-audio.ts
 *
 * Only imports `src/audio/cues.ts` (pure) plus the frozen snapshot contract in
 * `src/game/types.ts`. Nothing is mocked: `cuesForTransition` is a function of
 * two snapshots, so the "fakes" below are just literal snapshots.
 */
import type { SwingCommit } from '../src/input/types.ts'
import type { HitKind, HitOutcome, SessionSnapshot, SwingResult } from '../src/game/types.ts'
import type { TimingBand } from '../src/game/timing.ts'
import {
  AMBIENCE_FADE_MS,
  AMBIENCE_STOP_DELAY_MS,
  APPLAUSE_DELAY_MS,
  BOO_GAIN,
  CHEER_DELAY_MS,
  FOUL_OHH_DELAY_MS,
  LOOKING_STRIKE_REACTION_DELAY_MS,
  MITT_DELAY_MS,
  QUIET_CHEER_GAIN,
  SWING_MISS_OHH_DELAY_MS,
  WHOOSH_LEAD_MS,
  cuesForTransition,
  trailingLookingStrikes,
  type Cue,
} from '../src/audio/cues.ts'
import { ALL_SOUND_IDS, type SoundId } from '../src/audio/types.ts'

let passed = 0
const failures: string[] = []

function check(name: string, cond: boolean, detail = ''): void {
  if (cond) passed += 1
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
}

function eq<T>(name: string, actual: T, expected: T): void {
  check(name, Object.is(actual, expected), `expected ${String(expected)}, got ${String(actual)}`)
}

function ids(cues: Cue[]): string {
  return cues.map((c) => (c.loop ? `${c.id}:${c.loop}` : c.id)).join(',')
}

function find(cues: Cue[], id: SoundId): Cue | undefined {
  return cues.find((c) => c.id === id && !c.loop)
}

// ------------------------------------------------------------------- builders

const TOTAL = 10
const T0 = 100_000
const FLIGHT = 1300

function outcome(kind: HitKind, over: Partial<HitOutcome> = {}): HitOutcome {
  const fair = kind !== 'foul' && kind !== 'whiff'
  return {
    kind,
    fair,
    distanceFt: fair ? 300 : 0,
    dirDeg: 0,
    launchDeg: 20,
    flightMs: fair ? 1800 : 0,
    ...over,
  }
}

const COMMIT: SwingCommit = { atMs: T0 + FLIGHT, source: 'pointer' }

function result(
  index: number,
  band: TimingBand,
  kind: HitKind,
  commit: SwingCommit | null = COMMIT,
  over: Partial<HitOutcome> = {},
): SwingResult {
  return {
    pitchIndex: index,
    band,
    points: 0,
    commit,
    deltaMs: commit ? 0 : null,
    outcome: outcome(kind, over),
    resolvedAtMs: T0 + index * 4000 + FLIGHT,
  }
}

function snap(over: Partial<SessionSnapshot> = {}): SessionSnapshot {
  const completed = over.completed ?? []
  return {
    totalPitches: TOTAL,
    phase: 'idle',
    completed,
    score: 0,
    current: null,
    lastResult: completed.length ? completed[completed.length - 1] : null,
    finished: false,
    running: false,
    ...over,
  }
}

/** Snapshot for "pitch `index` is in the air". */
function pitching(index: number, completed: SwingResult[] = []): SessionSnapshot {
  const startedAtMs = T0 + index * 4000
  return snap({
    phase: 'pitching',
    running: true,
    completed,
    current: { index, startedAtMs, contactAtMs: startedAtMs + FLIGHT },
  })
}

/** Snapshot for "the result of pitch `index` just landed". */
function resulting(completed: SwingResult[]): SessionSnapshot {
  return snap({ phase: 'result', running: true, completed })
}

// ----------------------------------------------------------------- 1. cold start

{
  const idle = snap()
  eq('idle -> idle fires nothing', ids(cuesForTransition(null, idle)), '')

  // start(): running flips on before the first pitch leaves the pitcher.
  const started = snap({ running: true })
  const cues = cuesForTransition(idle, started)
  eq('round start raises the ambience bed', ids(cues), 'crowd_ambience:start')
  eq('ambience cue is a loop start', cues[0].loop, 'start')
}

// ------------------------------------------------- 2. first pitch -> whoosh timing

{
  const started = snap({ running: true })
  const p0 = pitching(0)
  const cues = cuesForTransition(started, p0)
  eq('first pitch fires exactly one whoosh', ids(cues), 'pitch_whoosh')
  const whoosh = find(cues, 'pitch_whoosh')!
  eq(
    'whoosh is scheduled to lead the contact point',
    whoosh.atPerfMs,
    p0.current!.contactAtMs - WHOOSH_LEAD_MS,
  )
  check('whoosh uses absolute scheduling, not a delay', whoosh.delayMs === undefined)
  check('whoosh lead is inside the pitch flight', WHOOSH_LEAD_MS > 0 && WHOOSH_LEAD_MS < FLIGHT)

  // Same snapshot again (React re-render, re-emit, StrictMode double effect).
  eq('re-delivering the pitch snapshot fires nothing', ids(cuesForTransition(p0, p0)), '')
  // A snapshot with the *same* startedAtMs but a different phase object.
  const p0again = pitching(0)
  eq(
    'an equal-but-new pitch snapshot does not re-whoosh',
    ids(cuesForTransition(p0, p0again)),
    '',
  )

  // Next pitch has a new startedAtMs -> a new whoosh.
  const r0 = result(0, 'perfect', 'homer')
  const afterResult = resulting([r0])
  const p1 = pitching(1, [r0])
  eq('second pitch whooshes again', ids(cuesForTransition(afterResult, p1)), 'pitch_whoosh')
}

// ----------------------------------------------------------- 3. every band / kind

function resultCues(r: SwingResult, priorCompleted: SwingResult[] = []): Cue[] {
  const completed = [...priorCompleted, r]
  const before = priorCompleted.length
    ? resulting(priorCompleted)
    : snap({ running: true, phase: 'pitching' })
  return cuesForTransition(before, resulting(completed))
}

{
  // perfect + homer -> crack then the big cheer
  const cues = resultCues(result(0, 'perfect', 'homer'))
  eq('perfect homer', ids(cues), 'bat_crack_perfect,crowd_cheer_big')
  eq('big cheer trails the bat', find(cues, 'crowd_cheer_big')!.delayMs, CHEER_DELAY_MS)
}

{
  // perfect but only a deep fly -> the small cheer
  const cues = resultCues(result(1, 'perfect', 'deep'))
  eq('perfect non-homer', ids(cues), 'bat_crack_perfect,crowd_cheer_small')
  eq('small cheer trails the bat', find(cues, 'crowd_cheer_small')!.delayMs, CHEER_DELAY_MS)
  check('perfect cheer is not ducked', find(cues, 'crowd_cheer_small')!.gain === undefined)
}

for (const band of ['early', 'late'] as const) {
  for (const kind of ['deep', 'liner', 'grounder'] as const) {
    const cues = resultCues(result(2, band, kind))
    eq(`${band} fair ${kind}`, ids(cues), 'bat_crack_contact,crowd_cheer_small')
    eq(
      `${band} ${kind} cheer is ducked`,
      find(cues, 'crowd_cheer_small')!.gain,
      QUIET_CHEER_GAIN,
    )
  }

  const foul = resultCues(result(3, band, 'foul'))
  eq(`${band} foul`, ids(foul), 'bat_foul_tip,crowd_ohh')
  eq(`${band} foul groan delay`, find(foul, 'crowd_ohh')!.delayMs, FOUL_OHH_DELAY_MS)
}

{
  // swinging strike: whiff, then the mitt, then the groan
  const cues = resultCues(result(4, 'miss', 'whiff', COMMIT))
  eq('swinging strike', ids(cues), 'whiff,catcher_mitt,crowd_ohh')
  eq('mitt follows the whiff', find(cues, 'catcher_mitt')!.delayMs, MITT_DELAY_MS)
  eq('groan follows the mitt', find(cues, 'crowd_ohh')!.delayMs, SWING_MISS_OHH_DELAY_MS)
  check(
    'mitt lands before the groan',
    find(cues, 'catcher_mitt')!.delayMs! < find(cues, 'crowd_ohh')!.delayMs!,
  )
}

// ---------------------------------------------- 4. consecutive looking strikes

{
  const looking = (i: number) => result(i, 'miss', 'whiff', null)

  // 1st called strike in a row -> groan, no boo
  const first = resultCues(looking(0))
  eq('one called strike -> ohh', ids(first), 'catcher_mitt,crowd_ohh')
  eq(
    'ohh reaction delay',
    find(first, 'crowd_ohh')!.delayMs,
    LOOKING_STRIKE_REACTION_DELAY_MS,
  )

  // 2nd in a row -> boo
  const second = resultCues(looking(1), [looking(0)])
  eq('two called strikes in a row -> boo', ids(second), 'catcher_mitt,crowd_boo')
  eq('boo is a garnish', find(second, 'crowd_boo')!.gain, BOO_GAIN)
  eq(
    'boo reaction delay',
    find(second, 'crowd_boo')!.delayMs,
    LOOKING_STRIKE_REACTION_DELAY_MS,
  )

  // 3rd in a row -> still boo
  const third = resultCues(looking(2), [looking(0), looking(1)])
  eq('three called strikes -> boo', ids(third), 'catcher_mitt,crowd_boo')

  // A swing in between breaks the streak.
  const broken = resultCues(looking(2), [looking(0), result(1, 'miss', 'whiff', COMMIT)])
  eq('a swinging strike breaks the streak', ids(broken), 'catcher_mitt,crowd_ohh')

  // ...and so does a hit.
  const brokenByHit = resultCues(looking(2), [looking(0), result(1, 'perfect', 'homer')])
  eq('a hit breaks the streak', ids(brokenByHit), 'catcher_mitt,crowd_ohh')

  eq('trailing count: empty', trailingLookingStrikes([]), 0)
  eq('trailing count: one', trailingLookingStrikes([looking(0)]), 1)
  eq('trailing count: two', trailingLookingStrikes([looking(0), looking(1)]), 2)
  eq(
    'trailing count stops at the last swing',
    trailingLookingStrikes([looking(0), result(1, 'late', 'liner'), looking(2)]),
    1,
  )
}

// ------------------------------------------------------------- 5. round end

{
  const completed = Array.from({ length: TOTAL }, (_, i) => result(i, 'perfect', 'homer'))
  const before = resulting(completed.slice(0, TOTAL - 1))
  const finished = snap({
    phase: 'finished',
    finished: true,
    running: false,
    completed,
  })
  const cues = cuesForTransition(before, finished)

  eq(
    'round end: last result, applause, ambience fade',
    ids(cues),
    'bat_crack_perfect,crowd_cheer_big,applause_end,crowd_ambience:stop',
  )
  eq('applause delay', find(cues, 'applause_end')!.delayMs, APPLAUSE_DELAY_MS)

  const fade = cues.find((c) => c.loop === 'stop')!
  eq('ambience stop is delayed ~1 s', fade.delayMs, AMBIENCE_STOP_DELAY_MS)
  eq('ambience fades over ~1 s', fade.fadeMs, AMBIENCE_FADE_MS)

  eq('re-delivering the finished snapshot fires nothing', ids(cuesForTransition(finished, finished)), '')

  // Play again from the end card: bed comes back, no second applause.
  const restarted = snap({ running: true, phase: 'idle' })
  eq('play again re-raises the bed', ids(cuesForTransition(finished, restarted)), 'crowd_ambience:start')
}

{
  // stop() mid-round: kill the bed, no applause.
  const before = pitching(3, [result(0, 'perfect', 'homer')])
  const stopped = snap({ running: false, phase: 'idle', completed: before.completed })
  const cues = cuesForTransition(before, stopped)
  eq('stop mid-round drops the bed only', ids(cues), 'crowd_ambience:stop')
  check('no applause on a manual stop', find(cues, 'applause_end') === undefined)
}

// ------------------------------------------------- 6. whole-round integration

{
  // Drive ten pitches and count every cue: no id may fire twice per pitch.
  const bands: [TimingBand, HitKind, SwingCommit | null][] = [
    ['perfect', 'homer', COMMIT],
    ['perfect', 'deep', COMMIT],
    ['early', 'liner', COMMIT],
    ['late', 'grounder', COMMIT],
    ['early', 'foul', COMMIT],
    ['miss', 'whiff', COMMIT],
    ['miss', 'whiff', null],
    ['miss', 'whiff', null],
    ['late', 'deep', COMMIT],
    ['perfect', 'homer', COMMIT],
  ]

  let prev: SessionSnapshot | null = null
  const fired: string[] = []
  const push = (next: SessionSnapshot) => {
    for (const c of cuesForTransition(prev, next)) fired.push(c.loop ? `${c.id}:${c.loop}` : c.id)
    prev = next
  }

  push(snap())
  push(snap({ running: true }))
  const completed: SwingResult[] = []
  for (let i = 0; i < TOTAL; i += 1) {
    push(pitching(i, [...completed]))
    // Re-emit the same pitch snapshot (the scene re-renders constantly).
    push(pitching(i, [...completed]))
    const [band, kind, commit] = bands[i]
    completed.push(result(i, band, kind, commit))
    if (i < TOTAL - 1) push(resulting([...completed]))
    else push(snap({ phase: 'finished', finished: true, running: false, completed: [...completed] }))
  }

  const count = (id: string) => fired.filter((f) => f === id).length
  eq('exactly one whoosh per pitch', count('pitch_whoosh'), TOTAL)
  eq('three perfect cracks', count('bat_crack_perfect'), 3)
  eq('three contact cracks', count('bat_crack_contact'), 3)
  eq('one foul tip', count('bat_foul_tip'), 1)
  eq('one whiff', count('whiff'), 1)
  eq('two big cheers', count('crowd_cheer_big'), 2)
  eq('four small cheers', count('crowd_cheer_small'), 4)
  eq('three mitt pops', count('catcher_mitt'), 3)
  eq('one boo (second looking strike only)', count('crowd_boo'), 1)
  eq('groans: foul + swinging miss + first looking strike', count('crowd_ohh'), 3)
  eq('one applause', count('applause_end'), 1)
  eq('bed raised once', count('crowd_ambience:start'), 1)
  eq('bed dropped once', count('crowd_ambience:stop'), 1)
  eq('applause comes before the bed fade', fired.indexOf('applause_end') < fired.lastIndexOf('crowd_ambience:stop'), true)

  // Every cue id the mapper can emit must be a real SoundId.
  const unknown = fired.filter((f) => !ALL_SOUND_IDS.includes(f.split(':')[0] as SoundId))
  eq('every fired id is a declared SoundId', unknown.join(','), '')
}

// ----------------------------------------------------------------- report

if (failures.length > 0) {
  console.error(`check-audio: ${failures.length} FAILED, ${passed} passed`)
  for (const f of failures) console.error(`  x ${f}`)
  process.exit(1)
}
console.log(`check-audio: all ${passed} checks passed`)
