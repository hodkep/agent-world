/** How long the terminal screen must have been still before it can say an agent has stopped. */
export const SETTLED_MS = 700
/** An event that said the agent is busy is fresher than a screen read: for this long after one, the screen cannot call the agent idle. */
export const BUSY_EVENT_GRACE_MS = 3000

/**
 * Whether the terminal screen may call an agent idle: its input box shows, nothing is working, no menu is up and the screen has been quiet.
 * It never overrides a busy event of the last few seconds: a screen read can be stale (the app is slow) or show no spinner yet (a turn
 * has just begun), and nothing would set the agent busy again before its first tool call.
 */
export function mayCallIdle(o: { now: number; lastOutput: number; lastBusyEvent: number; inputReady: boolean; menu: boolean; working: boolean }): boolean {
  return o.now - o.lastOutput > SETTLED_MS && o.now - o.lastBusyEvent >= BUSY_EVENT_GRACE_MS && o.inputReady && !o.menu && !o.working
}
