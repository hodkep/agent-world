export interface Snap {
  text: string
  caret: number
}

/** Typing within this long of the last keystroke is one undo step, as in a plain text box. */
const GROUP_MS = 1000

/**
 * Undo and redo for the message box. The browser's own history loses steps whenever the page rewrites the text
 * (a completion, a recalled message), so the box keeps its own: typing groups into bursts, everything else is a step.
 */
export class UndoStack {
  private past: Snap[] = []
  private future: Snap[] = []
  private typedAt = -Infinity
  private typing = false

  constructor(private cur: Snap, private max = 200) {}

  record(next: Snap, kind: 'type' | 'edit', now: number) {
    if (next.text === this.cur.text) return
    if (!(kind === 'type' && this.typing && now - this.typedAt < GROUP_MS)) {
      this.past.push(this.cur)
      if (this.past.length > this.max) this.past.shift()
    }
    this.future = []
    this.typing = kind === 'type'
    this.typedAt = now
    this.cur = next
  }

  undo(): Snap | null {
    const prev = this.past.pop()
    if (!prev) return null
    this.future.push(this.cur)
    this.typing = false
    return (this.cur = prev)
  }

  redo(): Snap | null {
    const next = this.future.pop()
    if (!next) return null
    this.past.push(this.cur)
    this.typing = false
    return (this.cur = next)
  }

  reset(to: Snap) {
    this.past = []
    this.future = []
    this.typing = false
    this.cur = to
  }
}
