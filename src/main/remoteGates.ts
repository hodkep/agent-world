import { answersOf, planReply, unanswered } from '../shared/plan'
import { codeOf, parseAnswers } from '../shared/remoteReply'
import { pendingPlans } from '../shared/runs'
import { auditSetAside, runEnded, stepDeclined, stepRefusedLater, stepReply, stepSkipped, stepSkippedOnward, stepStarted, stepsKept, stepsSkipped } from '../shared/steps'
import type { Workflows } from './workflows/service'
import type { HeldMerges } from './workflows/heldMerges'
import { type Gate, remoteHint, resolveReply, touches } from './remoteReply'

/** What the gates need from the office; the module itself knows no provider and no window. */
export interface RemoteGateDeps {
  workflows: Pick<Workflows, 'runs' | 'decide' | 'waitingStep' | 'approveStep' | 'startStep' | 'skipStep' | 'declineStep' | 'nextAfter' | 'seen' | 'addToPlan' | 'asideAudit' | 'allowLanding' | 'skipAsked' | 'answerSkip' | 'refusedFor' | 'skipRefused' | 'deferRefused' | 'endRun'>
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
 * The office's gates (plan, step, audit, held push, a request to skip steps, a refused step) as decisions a typed reply can make for an agent under remote control. Each does what the card's
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
        label: 'the plan',
        code: codeOf(`plan:${run.id}:${plan.submittedAt}`),
        replies: [
          { verb: 'approve', usage: 'approve CODE', does: 'approve the plan' },
          { verb: 'approve', usage: 'approve CODE 1=2, 2=words', does: 'approve it and answer its questions by option number or in words' },
          { verb: 'changes', usage: 'changes CODE: what to change', does: 'send it back' },
          { verb: 'release', usage: 'release CODE', does: 'let the agent go on without a decision' }
        ],
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
      label: step.toRun ? `the step "${step.name}", which waits for your Run` : `the step "${step.name}", waiting for approval`,
      code: codeOf(`step:${step.run}:${step.step}:${logged}`),
      replies: step.toRun
        ? [{ verb: 'approve', usage: 'approve CODE', does: 'Run it now' }, { verb: 'changes', usage: 'changes CODE: why not', does: 'not now, with your reason' }]
        : [{ verb: 'approve', usage: 'approve CODE', does: 'approve the work' }, { verb: 'changes', usage: 'changes CODE: what to change', does: 'send the work back' }],
      apply: (reply) => {
        const changes = reply.verb === 'changes'
        if (changes && !reply.rest) throw new Error('It needs what to change after the colon.')
        // A step that starts on Run is asked about before it starts: approve is the person's Run, and changes is Not now, with their reason (an optional step is skipped, any other fails and stops the workflow).
        if (step.toRun) {
          const run = workflows.runs().find((r) => r.id === step.run)
          const found = run?.workflow?.steps.find((s) => s.id === step.step)
          const why = reply.rest.slice(0, 2000)
          let told: string
          if (!changes) told = stepStarted(workflows.startStep(step.run, step.step))
          else if (found?.optional) told = stepSkipped(workflows.skipStep(step.run, step.step), run ? workflows.nextAfter(run, step.step)?.name : undefined)
          else told = stepDeclined(workflows.declineStep(step.run, step.step))
          d.send('workflows')
          return changes && why ? `${told} They said: ${why}` : told
        }
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
      label: 'the audit findings',
      code: codeOf(`audit:${run.id}:${audit.head}`),
      replies: [
        { verb: 'seen', usage: 'seen CODE', does: 'mark them seen, or `seen CODE 1,3` for some' },
        { verb: 'plan', usage: 'plan CODE 2', does: 'add an out-of-scope finding to the plan' },
        { verb: 'aside', usage: 'aside CODE', does: 'set the audit aside so it no longer holds the merge' }
      ],
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
      label: 'the held push',
      code: codeOf(`push:${agentId}:${hold.head}`),
      replies: [
        { verb: 'allow', usage: 'allow CODE', does: 'push although it was held' },
        { verb: 'decline', usage: 'decline CODE', does: 'not yet: do not push' }
      ],
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

  const skipGates = (agentId: string): Gate[] => {
    const ask = workflows.skipAsked(agentId)
    if (!ask) return []
    return [{
      label: 'the request to skip steps',
      code: codeOf(`skip:${ask.run}:${ask.names.join(',')}`),
      replies: [
        { verb: 'skip', usage: 'skip CODE', does: `skip ${ask.names.join(', ')}: ${ask.why}` },
        { verb: 'keep', usage: 'keep CODE', does: 'keep them in the workflow' }
      ],
      apply: (reply) => {
        const r = workflows.answerSkip(ask.run, reply.verb === 'skip')
        d.send('workflows')
        return r.approved ? stepsSkipped(r.names, r.why, reply.rest) : stepsKept(r.names, reply.rest)
      }
    }]
  }

  const refusedGates = (agentId: string): Gate[] => {
    const found = workflows.refusedFor(agentId)
    if (!found) return []
    const { run, ask } = found
    return [{
      label: `the refused step "${ask.name}"`,
      code: codeOf(`refused:${run}:${ask.id}`),
      replies: [
        ...(ask.skippable ? [{ verb: 'skip', usage: 'skip CODE', does: `skip it and go on${ask.rest.length ? ` (still to go: ${ask.rest.join(', ')})` : ''}` }] : []),
        { verb: 'later', usage: 'later CODE', does: 'ask again later; it stays refused' },
        { verb: 'stop', usage: 'stop CODE', does: 'stop the run here' }
      ],
      apply: (reply) => {
        const note = reply.rest.slice(0, 2000)
        let told: string
        if (reply.verb === 'skip') {
          const next = workflows.runs().find((r) => r.id === run)
          told = stepSkippedOnward(workflows.skipRefused(run, ask.id), next ? workflows.nextAfter(next, ask.id)?.name : undefined, note)
        } else if (reply.verb === 'later') told = stepRefusedLater(workflows.deferRefused(run, ask.id), note)
        else {
          workflows.endRun(run, 'The person stopped the run after refusing a step.')
          told = runEnded(workflows.runs().find((r) => r.id === run)?.title ?? '', note)
        }
        d.send('workflows')
        return told
      }
    }]
  }

  /** The decisions waiting on the person for this agent. */
  const gatesFor = (agentId: string): Gate[] => [...planGates(agentId), ...stepGates(agentId), ...auditGates(agentId), ...pushGates(agentId), ...skipGates(agentId), ...refusedGates(agentId)]

  return {
    decidePlan,
    gatesFor,
    /** Whether a prompt is, or looks like, a decision on one of this agent's waiting gates (the only prompts whose origin has to be shown). */
    touches: (agentId: string, prompt: string): boolean => d.isRemote(agentId) && touches(gatesFor(agentId), prompt),
    /** What a typed prompt does to a waiting gate: the text the agent is told, or null (not under remote control, or not a decision). */
    reply: (agentId: string, prompt: string): string | null => {
      if (!d.isRemote(agentId)) return null
      const told = resolveReply(gatesFor(agentId), prompt)
      // A decision can leave another waiting (a refusal asks what next): the agent is told the words for it straight away.
      return told === null ? null : told + remoteHint(gatesFor(agentId))
    },
    /** The sentence a gate's text adds so the agent tells the person which words answer it; empty when not under remote control. */
    hint: (agentId: string): string => (d.isRemote(agentId) ? remoteHint(gatesFor(agentId)) : '')
  }
}
