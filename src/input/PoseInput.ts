import type { CommitHandler, InputPort } from './types'

/**
 * Stage 2 stub — webcam / MediaPipe Pose.
 * Wire MediaPipe here later; emit SwingCommit with source: 'pose'.
 * Do not import pose libraries until Stage 2 is enabled.
 */
export class PoseInput implements InputPort {
  private handlers = new Set<CommitHandler>()

  start(): void {
    console.warn(
      '[PoseInput] Stage 2 not enabled. Set VITE_INPUT_MODE=pose and implement MediaPipe.',
    )
  }

  stop(): void {
    // no-op until Stage 2
  }

  onCommit(handler: CommitHandler): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }
}
