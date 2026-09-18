/**
 * React glue. Two hooks, both deliberately thin:
 *
 * - `useAudioSettings()` mirrors the engine's persisted settings into React.
 * - `useGameAudio(snapshot)` diffs consecutive snapshots through the pure cue
 *   mapper and hands the result to the engine.
 *
 * All the mapping rules live in ./cues.ts, so nothing here needs testing and
 * nothing here touches Web Audio directly.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { SessionSnapshot } from '../game/types.ts'
import { AudioEngine, getAudioEngine } from './AudioEngine.ts'
import { cuesForTransition } from './cues.ts'
import type { AudioSettings } from './types.ts'

export function useAudioEngine(): AudioEngine {
  return getAudioEngine()
}

export function useAudioSettings(): AudioSettings {
  const engine = getAudioEngine()
  return useSyncExternalStore(
    (cb) => engine.subscribe(cb),
    () => engine.getSettings(),
    () => engine.getSettings(),
  )
}

/**
 * Fires cues off snapshot transitions.
 *
 * Double-fire safety comes from two places: the cue mapper keys every trigger
 * on a monotonic timestamp (`startedAtMs` / `resolvedAtMs`), and `prev` is a
 * ref, so StrictMode's double effect invocation diffs the snapshot against
 * itself the second time and produces nothing.
 */
export function useGameAudio(snapshot: SessionSnapshot): AudioEngine {
  const engine = getAudioEngine()
  const prev = useRef<SessionSnapshot | null>(null)

  useEffect(() => {
    const cues = cuesForTransition(prev.current, snapshot)
    prev.current = snapshot
    engine.fireCues(cues)
  }, [engine, snapshot])

  useEffect(
    () => () => {
      engine.stopAll()
    },
    [engine],
  )

  return engine
}
