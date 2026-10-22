import { answersOf, planReply, unanswered } from '../shared/plan'
import { codeOf, parseAnswers } from '../shared/remoteReply'
import { pendingPlans } from '../shared/runs'
import { auditSetAside, stepReply } from '../shared/steps'
import type { Workflows } from './workflows/service'
import type { HeldMerges } from './workflows/heldMerges'
import { type Gate, remoteHint, resolveReply, touches } from './remoteReply'

/** What the gates need from the office; the module itself knows no provider and no window. */
export interface RemoteGateDeps {
  workflows: Pick<Workflows, 'runs' | 'decide' | 'waitingStep' | 'approveStep' | 'seen' | 'addToPlan' | 'asideAudit' | 'allowLanding'>
  held: Pick<HeldMerges, 'list' | 'decline' | 'take'>
  /** Tells the window a gate changed. */
  send: (channel: 'workflows' | 'landing') => void
  /** What follows an answer to the audit (the office asks about a pull request). */
  afterAudit: (agentId: string) => void
  /** Whether this agent is under remote control: only then do typed words decide anything, and only then is the code told. */
  isRemote: (agentId: string) => boolean
}

type PlanState = 'approved' | 'changes' | 'released'
type PlanAnswers = { note?: string; answers?: { question: string; answer: string }[] }

/**
 * The office's four gates (plan, step, audit, held push) as decisions a typed reply can make for an agent under remote control. Each does what the card's
 * button does, so the first answer from either place wins. Any provider's prompt hook can use `reply`, and any gate text can add `hint`.
 */
export function createRemoteGates(d: RemoteGateDeps) {
  const { workflows, held } = d

  /** The person's answer to a plan, from the card or a typed reply; what the agent is told comes back. */
  const decidePlan = (runId: string, state: PlanState, o: PlanAnswers) => {
    const note = o?.note?.slice(0, 2000)
    const answers = o?.answers?.slice(0, 20)
    workflows.decide(runId, state, { note, answers })
    d.send('workflows')
    return planReply(state, { note, answers })
  }

  const planGates = (agentId: string): Gate[] =>
    pendingPlans(workflows.runs()).flatMap(({ run, round }) => {
      if (run.agent !== agentId) return []
      const plan = round.plan!
      return [{
        kind: 'plan' as const,
        code: codeOf(`plan:${run.id}:${plan.submittedAt}`),
        apply: (reply) => {
          if (reply.verb === 'release') return decidePlan(run.id, 'released', {})
          if (reply.verb === 'changes') {
            if (!reply.rest) throw new Error('It needs what to change after the colon.')
            return decidePlan(run.id, 'changes', { note: reply.rest })
          }
          const pairs = parseAnswers(reply.rest)
          if (!pairs) throw new Error('The answers must look like `1=2, 2=words`.')
          const chosen: Record<string, string> = {}
          for (const { n, value } of pairs) {
            const q = plan.readback.questions[n - 1]
            if (!q) throw new Error(`There is no question ${n}.`)
            chosen[q.text] = /^\d+$/.test(value) && q.options[Number(value) - 1] ? q.options[Number(value) - 1]! : value
          }
          const open = unanswered(plan.readback, chosen)
          if (open.length) throw new Error(`${open.length === 1 ? '1 question is' : `${open.length} questions are`} still open: ${open.map((q) => `"${q}"`).join(', ')}.`)
          return decidePlan(run.id, 'approved', { answers: answersOf(plan.readback, chosen) })
        }
      }]
    })

  const stepGates = (agentId: string): Gate[] => {
    const step = workflows.waitingStep(agentId)
    if (!step) return []
    // How often the run's steps were logged is part of the code, so a step sent back and reported again waits under a new one.
    const logged = workflows.runs().filter((r) => r.agent === agentId).at(-1)?.rounds.at(-1)?.steps.length ?? 0
    return [{
      kind: 'step',
      code: codeOf(`step:${step.run}:${step.step}:${logged}`),
      apply: (reply) => {
        const changes = reply.verb === 'changes'
        if (changes && !reply.rest) throw new Error('It needs what to change after the colon.')
        workflows.approveStep(step.run, step.step, changes ? 'changes' : 'approved', { note: reply.rest.slice(0, 2000) })
        d.send('workflows')
        return stepReply(step.name, changes ? 'changes' : 'approved', reply.rest.slice(0, 2000))
      }
    }]
  }

  const auditGates = (agentId: string): Gate[] => {
    const run = workflows.runs().filter((r) => r.agent === agentId).at(-1)
    const audit = run?.audit
    if (!run || audit?.state !== 'done' || !audit.findings.some((f) => !f.seen) || auditSetAside(run)) return []
    return [{
      kind: 'audit',
      code: codeOf(`audit:${run.id}:${audit.head}`),
      apply: (reply) => {
        const done = () => (d.send('workflows'), d.send('landing'), d.afterAudit(agentId))
        if (reply.verb === 'aside') {
          workflows.asideAudit(agentId, audit.head)
          done()
          return 'The person set the audit aside: its findings no longer hold the merge.'
        }
        const picked = reply.rest ? reply.rest.split(/[,\s]+/).map(Number) : audit.findings.flatMap((f, i) => (f.seen ? [] : [i + 1]))
        if (picked.some((n) => !Number.isInteger(n) || n < 1 || !audit.findings[n - 1])) throw new Error('The numbers must be findings of the audit, like `1,3`.')
        if (reply.verb === 'plan') workflows.addToPlan(agentId, audit.head, picked.map((n) => n - 1))
        else workflows.seen(agentId, audit.head, picked.map((n) => n - 1))
        done()
        return reply.verb === 'plan' ? 'The person added those findings to the plan.' : 'The person marked the audit findings as seen.'
      }
    }]
  }

  const pushGates = (agentId: string): Gate[] => {
    const hold = held.list().find((h) => h.agentId === agentId && !h.declined)
    if (!hold) return []
    return [{
      kind: 'push',
      code: codeOf(`push:${agentId}:${hold.head}`),
      apply: (reply) => {
        if (reply.verb === 'decline') {
          held.decline(agentId)
          d.send('landing')
          return 'The person said not yet: do not push.'
        }
        held.take(agentId)
        workflows.allowLanding(agentId, hold.head)
        d.send('landing')
        return 'The person allowed the push although it was held: push again.'
      }
    }]
  }

  /** The decisions waiting on the person for this agent. */
  const gatesFor = (agentId: string): Gate[] => [...planGates(agentId), ...stepGates(agentId), ...auditGates(agentId), ...pushGates(agentId)]

  return {
    decidePlan,
    gatesFor,
    /** Whether a prompt is, or looks like, a decision on one of this agent's waiting gates (the only prompts whose origin has to be shown). */
    touches: (agentId: string, prompt: string): boolean => d.isRemote(agentId) && touches(gatesFor(agentId), prompt),
    /** What a typed prompt does to a waiting gate: the text the agent is told, or null (not under remote control, or not a decision). */
    reply: (agentId: string, prompt: string): string | null => (d.isRemote(agentId) ? resolveReply(gatesFor(agentId), prompt) : null),
    /** The sentence a gate's text adds so the agent tells the person which words answer it; empty when not under remote control. */
    hint: (agentId: string): string => (d.isRemote(agentId) ? remoteHint(gatesFor(agentId)) : '')
  }
}
