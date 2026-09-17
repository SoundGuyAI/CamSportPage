/** Fired when the player commits a swing. Shared by Stage 1 and Stage 2. */
export type SwingCommit = {
  /** performance.now() (or game clock) when the swing was detected */
  atMs: number
  /** 'camera' = frame-difference webcam swing; 'pose' reserved for MediaPipe. */
  source: 'pointer' | 'keyboard' | 'pose' | 'camera'
  /** Stage 2: normalized swing strength 0–1; Stage 1 may pass 1 */
  power?: number
}

export type CommitHandler = (commit: SwingCommit) => void

/**
 * Input adapter contract.
 * GameSession only consumes SwingCommit — never DOM, camera, or MediaPipe directly.
 */
export interface InputPort {
  start(): void
  stop(): void
  /** Register a commit listener; returns unsubscribe. */
  onCommit(handler: CommitHandler): () => void
}
