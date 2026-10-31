/**
 * Runs small updates together: each is queued, and all of them run in the order they came, one wait after the first. The updates in one run are one render,
 * so a stream of agent events costs one redraw of the app for each wait, not one for each event.
 */
export function createBatcher(ms: number) {
  let queue: (() => void)[] = []
  let timer: ReturnType<typeof setTimeout> | undefined
  const flush = () => {
    clearTimeout(timer)
    timer = undefined
    const run = queue
    queue = []
    for (const f of run) f()
  }
  const later = (f: () => void) => {
    queue.push(f)
    timer ??= setTimeout(flush, ms)
  }
  later.flush = flush
  /** Drops what is waiting; for when what it would update is gone. */
  later.stop = () => {
    clearTimeout(timer)
    timer = undefined
    queue = []
  }
  return later
}
