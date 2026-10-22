import { type Run, pendingPlans } from './runs'
import { type StepContext, checkPanels, stepStates, waitingSteps } from './steps'
import { isLanding, landingKind } from './workflow'

export type WaitKind = 'plan' | 'approve' | 'check' | 'audit' | 'land' | 'push'
/** One thing an agent's run cannot go on without the person for. */
export interface Wait {
  agentId: string
  /** The agent's latest run; none for a merge git holds in an agent with no tracked task. */
  run?: Run
  kind: WaitKind
}

/** What waits at the end of a run: a push for a pull request step, a landing for a merge. */
const landWait = (run: Run): WaitKind => (landingKind(run.workflow) === 'pr' ? 'push' : 'land')

/** What a wait is called on the pill beside the agent, as a permission is "allow?". */
export const waitWord = (kind: WaitKind) => ({ plan: 'plan', approve: 'approve', check: 'check?', audit: 'audit', land: 'land', push: 'push' })[kind]

/**
 * Everything that waits for the person across runs: a plan handed in, check commands to approve (or a check that gave up), a step to approve,
 * audit findings not seen, and Land (the work is built and nothing but the person's word is left, or git is holding a merge for it).
 */
export function waitsForPerson(runs: Run[], ctxFor: (run: Run) => StepContext, holds: { agentId: string; declined: boolean }[] = [], scope?: { project: string; agents: Set<string> }): Wait[] {
  // The open project's: another project's plans and held merges are not what the person is looking at.
  if (scope) (runs = runs.filter((r) => r.project === scope.project), (holds = holds.filter((h) => scope.agents.has(h.agentId))))
  // An agent that started something new has moved on from its earlier runs: only its latest run can wait for the person, or an old run's unanswered findings would wait for ever.
  const latest = new Map<string, Run>()
  for (const r of runs) if (!latest.has(r.agent) || r.startedAt >= latest.get(r.agent)!.startedAt) latest.set(r.agent, r)
  runs = runs.filter((r) => latest.get(r.agent) === r)
  const out: Wait[] = []
  const add = (run: Run, kind: WaitKind) => out.push({ agentId: run.agent, run, kind })
  for (const { run } of pendingPlans(runs)) if (run.status !== 'stopped') add(run, 'plan')
  for (const c of checkPanels(runs, ctxFor)) add(c.run, 'check')
  for (const r of runs) for (const { run } of waitingSteps([r], ctxFor(r))) add(run, 'approve')
  for (const run of runs) {
    if (run.status === 'stopped' || !run.workflow) continue
    for (const s of stepStates(run, ctxFor(run))) {
      // A step that waits for the person's approval was counted above, as an approval.
      if (s.state !== 'waiting' || s.awaiting) continue
      if (s.kind === 'audit') add(run, 'audit')
      if (isLanding(s.kind)) add(run, landWait(run))
    }
  }
  for (const h of holds) {
    if (h.declined || out.some((w) => w.agentId === h.agentId && (w.kind === 'land' || w.kind === 'push'))) continue
    const run = runs.filter((r) => r.agent === h.agentId).at(-1)
    out.push({ agentId: h.agentId, run, kind: run ? landWait(run) : 'land' })
  }
  return out
}
