import type { BrowserActivity } from '../../shared/api'

/** A run is over once this long passes without a command: the next one starts a new run. */
const RUN_GAP_MS = 30_000

/**
 * Whether the Preview should open by itself now: the person switched that on, the agent that has just begun browsing is the one they are looking at (so it never pulls them
 * from another), the Preview is not already open, and this is the first command of a run, not the middle of one.
 */
export function opensPreview(o: { setting: boolean; selected: string | null; view: string; prev?: BrowserActivity; next: BrowserActivity }): boolean {
  const { setting, selected, view, prev, next } = o
  if (!setting || view === 'preview' || selected !== next.agentId) return false
  if (!next.action || next.connections === 0) return false
  return !prev || prev.connections === 0 || next.at - prev.at > RUN_GAP_MS
}
