import { PointerInput } from './PointerInput'
import { PoseInput } from './PoseInput'
import type { InputPort } from './types'

export type InputMode = 'pointer' | 'pose'

export function resolveInputMode(
  envValue = import.meta.env.VITE_INPUT_MODE as string | undefined,
): InputMode {
  return envValue === 'pose' ? 'pose' : 'pointer'
}

/** Factory so GameSession never constructs a concrete input class. */
export function createInput(mode: InputMode = resolveInputMode()): InputPort {
  return mode === 'pose' ? new PoseInput() : new PointerInput()
}
