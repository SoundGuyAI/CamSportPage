import type { CommitHandler, InputPort, SwingCommit } from './types'

/** Stage 1: click / pointer / Space commits a swing. */
export class PointerInput implements InputPort {
  private handlers = new Set<CommitHandler>()
  private active = false

  private emit = (source: SwingCommit['source']) => {
    if (!this.active) return
    const commit: SwingCommit = {
      atMs: performance.now(),
      source,
      power: 1,
    }
    for (const handler of this.handlers) handler(commit)
  }

  private onPointerDown = (event: PointerEvent) => {
    // Ignore secondary buttons / UI chrome later via data attributes if needed
    if (event.button !== 0) return
    this.emit('pointer')
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (event.code !== 'Space' && event.code !== 'Enter') return
    event.preventDefault()
    this.emit('keyboard')
  }

  start(): void {
    if (this.active) return
    this.active = true
    window.addEventListener('pointerdown', this.onPointerDown)
    window.addEventListener('keydown', this.onKeyDown)
  }

  stop(): void {
    if (!this.active) return
    this.active = false
    window.removeEventListener('pointerdown', this.onPointerDown)
    window.removeEventListener('keydown', this.onKeyDown)
  }

  onCommit(handler: CommitHandler): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }
}
