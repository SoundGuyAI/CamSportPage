import type { CameraInput } from './CameraInput.ts'
import { CompositeInput } from './CompositeInput.ts'
import { PointerInput } from './PointerInput.ts'
import { PoseInput } from './PoseInput.ts'
import type { InputPort } from './types.ts'

export type InputMode = 'pointer' | 'pose' | 'camera'

/** localStorage key for the mode chosen in the UI (wins over the env default). */
export const INPUT_MODE_KEY = 'camsport.inputMode'

export function resolveInputMode(
  envValue = import.meta.env.VITE_INPUT_MODE as string | undefined,
): InputMode {
  if (envValue === 'pose') return 'pose'
  if (envValue === 'camera') return 'camera'
  return 'pointer'
}

/** Runtime mode picked in the UI; falls back to 'pointer' (never 'pose'). */
export function readStoredInputMode(): InputMode {
  try {
    const raw = globalThis.localStorage?.getItem(INPUT_MODE_KEY)
    return raw === 'camera' ? 'camera' : 'pointer'
  } catch {
    return 'pointer'
  }
}

export function writeStoredInputMode(mode: InputMode): void {
  try {
    globalThis.localStorage?.setItem(INPUT_MODE_KEY, mode)
  } catch {
    /* private mode — the choice just won't persist */
  }
}

/**
 * Factory so GameSession never constructs a concrete input class.
 * Camera mode composes the (long-lived) CameraInput with PointerInput so
 * mouse + keyboard keep working exactly as before.
 */
export function createInput(
  mode: InputMode = resolveInputMode(),
  camera?: CameraInput | null,
): InputPort {
  if (mode === 'camera' && camera) return new CompositeInput([new PointerInput(), camera])
  if (mode === 'pose') return new PoseInput()
  return new PointerInput()
}
