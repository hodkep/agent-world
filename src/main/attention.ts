import type { Activity } from '../shared/types'

export type Alert = 'permission' | 'trust' | 'finished' | 'budget'

const NEAR = 0.8

/** 'near' when the session's cost first crosses 80% of its budget, 'over' when it first crosses the budget. */
export function budgetAlert(prevCost: number, cost: number, budget: number | undefined): 'near' | 'over' | null {
  if (!budget || budget <= 0) return null
  if (prevCost < budget && cost >= budget) return 'over'
  if (prevCost < budget * NEAR && cost >= budget * NEAR) return 'near'
  return null
}

const RESTING = new Set<Activity | undefined>(['idle', 'waiting', 'asleep', undefined])

export function finishedTurn(prev: Activity | undefined, next: Activity) {
  return !RESTING.has(prev) && (next === 'idle' || next === 'waiting')
}

/** Don't pop notifications at someone already looking at the office; budget warnings always show. */
export function shouldNotify(kind: Alert, windowFocused: boolean) {
  return kind === 'budget' || !windowFocused
}

const NOTICE_FRESH_MS = 10 * 60_000

/**
 * Clicking a notification can start the app a second time, which hands over to the running one with nothing to say which
 * notification it was. The last one shown, while it is fresh, tells where the click was meant to go.
 */
export function noticeToOpen(last: { agentId?: string; at: number } | null, now: number): string | undefined {
  return last && now - last.at <= NOTICE_FRESH_MS ? last.agentId : undefined
}

/** Looking at every agent's screen is work, so it is done often only while something is being written; a quiet office is looked at once a second. */
export function idleCheckDelay(lastOutputs: number[], now: number): number {
  return lastOutputs.some((t) => now - t < 6000) ? 300 : 1000
}
