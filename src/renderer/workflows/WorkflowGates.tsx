import type { Round, Run, RunStep } from '../../shared/runs'
import type { CheckPanel } from '../../shared/steps'
import { CheckGate } from './CheckGate'
import { PlanGate } from './PlanGate'
import { RunGate } from './RunGate'
import { StepGate } from './StepGate'

type Decide = (state: 'approved' | 'changes' | 'released', o?: { note?: string; answers?: { question: string; answer: string }[] }) => void

/**
 * What waits for the person in an agent's chat: its plan, a check, a step that waits for Run, a step to approve. Each kind has a key of its own: the same step can have a Run card
 * and an Approval card, and two siblings with one key make React draw another copy on every refresh and leave the old ones behind.
 */
export function WorkflowGates({ agentName, plan, check, runStep, step, onDecidePlan, onDecideStep }: {
  agentName: string
  plan?: { run: Run; round: Round }
  check?: CheckPanel
  runStep?: { run: Run; step: RunStep }
  step?: { run: Run; step: RunStep }
  onDecidePlan: (runId: string, ...rest: Parameters<Decide>) => void
  onDecideStep: (runId: string, stepId: string, decision: 'approved' | 'changes', note?: string) => void
}) {
  return (
    <>
      {plan && <PlanGate key={`plan-${plan.run.id}`} agentName={agentName} run={plan.run} round={plan.round} onDecide={(state, o) => onDecidePlan(plan.run.id, state, o)} />}
      {check && <CheckGate key={`check-${check.run.id}-${check.step.id}-${check.kind}`} agentName={agentName} panel={check} />}
      {runStep && <RunGate key={`run-${runStep.run.id}-${runStep.step.id}`} agentName={agentName} run={runStep.run} step={runStep.step} />}
      {step && <StepGate key={`step-${step.run.id}-${step.step.id}`} agentName={agentName} run={step.run} step={step.step} onDecide={(decision, note) => onDecideStep(step.run.id, step.step.id, decision, note)} />}
    </>
  )
}
