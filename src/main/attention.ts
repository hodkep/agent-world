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
