/**
 * Audio contract. Kept dependency-free (no DOM, no Web Audio, no import.meta)
 * so the cue mapper in ./cues.ts can be unit-tested under plain node.
 */

/** Every sound the game can ask for. Both backends must answer all of them. */
export type SoundId =
  | 'crowd_ambience'
  | 'pitch_whoosh'
  | 'catcher_mitt'
  | 'bat_crack_perfect'
  | 'bat_crack_contact'
  | 'bat_foul_tip'
  | 'whiff'
  | 'crowd_cheer_big'
  | 'crowd_cheer_small'
  | 'crowd_ohh'
  | 'crowd_boo'
  | 'applause_end'
  | 'ui_click'

/** `real` = sampled files from public/sounds (with per-sound synth fallback). */
export type SoundMode = 'synth' | 'real'

export type AudioSettings = {
  mode: SoundMode
  muted: boolean
  /** master volume, 0..1 */
  volume: number
}

/** Ids that are meant to be looped rather than triggered. */
export const LOOP_IDS: readonly SoundId[] = ['crowd_ambience']

export const ALL_SOUND_IDS: readonly SoundId[] = [
  'crowd_ambience',
  'pitch_whoosh',
  'catcher_mitt',
  'bat_crack_perfect',
  'bat_crack_contact',
  'bat_foul_tip',
  'whiff',
  'crowd_cheer_big',
  'crowd_cheer_small',
  'crowd_ohh',
  'crowd_boo',
  'applause_end',
  'ui_click',
]

/** One entry of public/sounds/manifest.json. */
export type SampleEntry = {
  file: string
  loop?: boolean
  gain?: number
  license?: string
  source?: string
  author?: string
}

export type SampleManifest = {
  version: number
  sounds: Partial<Record<SoundId, SampleEntry>>
}

/** Attribution line for the footer (CC-BY style licenses only). */
export type SoundCredit = {
  id: SoundId
  license: string
  source?: string
  author?: string
}

/** What a backend has to offer the engine. */
export type SoundBackend = {
  play(id: SoundId, opts?: { at?: number; gain?: number }): void
  startLoop(id: SoundId): void
  stopLoop(id: SoundId, fadeMs?: number): void
  stopAll(): void
}
