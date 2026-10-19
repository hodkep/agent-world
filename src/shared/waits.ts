import { type Run, pendingPlans } from './runs'
import { type StepContext, checkPanels, stepStates, waitingSteps } from './steps'

export type WaitKind = 'plan' | 'approve' | 'check' | 'audit' | 'land'
/** One thing an agent's run cannot go on without the person for. */
export interface Wait {
  agentId: string
  /** The agent's latest run; none for a merge git holds in an agent with no tracked task. */
  run?: Run
  kind: WaitKind
}

/** What a wait is called on the pill beside the agent, as a permission is "allow?". */
export const waitWord = (kind: WaitKind) => ({ plan: 'plan', approve: 'approve', check: 'check?', audit: 'audit', land: 'land' })[kind]

/**
 * Everything that waits for the person across runs: a plan handed in, check commands to approve (or a check that gave up), a step to approve,
 * audit findings not seen, and Land (the work is built and nothing but the person's word is left, or git is holding a merge for it).
 */
export function waitsForPerson(runs: Run[], ctxFor: (run: Run) => StepContext, holds: { agentId: string; declined: boolean }[] = []): Wait[] {
  const out: Wait[] = []
  const add = (run: Run, kind: WaitKind) => out.push({ agentId: run.agent, run, kind })
  for (const { run } of pendingPlans(runs)) if (run.status !== 'stopped') add(run, 'plan')
  for (const c of checkPanels(runs, ctxFor)) add(c.run, 'check')
  for (const { run } of waitingSteps(runs, { auditOn: true })) add(run, 'approve')
  for (const run of runs) {
    if (run.status === 'stopped' || !run.workflow) continue
    for (const s of stepStates(run, ctxFor(run))) {
      if (s.state !== 'waiting') continue
      if (s.kind === 'audit') add(run, 'audit')
      if (s.kind === 'merge') add(run, 'land')
    }
  }
  for (const h of holds) if (!h.declined && !out.some((w) => w.agentId === h.agentId && w.kind === 'land')) out.push({ agentId: h.agentId, run: runs.filter((r) => r.agent === h.agentId).at(-1), kind: 'land' })
  return out
}
