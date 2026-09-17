import type { CommitHandler, InputPort } from './types.ts'

/**
 * Fans start/stop/onCommit out to several InputPorts so webcam mode keeps
 * mouse + keyboard alive as a fallback. GameSession still sees one InputPort.
 */
export class CompositeInput implements InputPort {
  private readonly children: readonly InputPort[]

  constructor(children: readonly InputPort[]) {
    this.children = children
  }

  start(): void {
    for (const child of this.children) child.start()
  }

  stop(): void {
    for (const child of this.children) child.stop()
  }

  onCommit(handler: CommitHandler): () => void {
    const unsubs = this.children.map((child) => child.onCommit(handler))
    return () => {
      for (const unsub of unsubs) unsub()
    }
  }
}
