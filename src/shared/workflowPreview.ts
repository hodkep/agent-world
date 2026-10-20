import { DEFAULT_RETRIES } from './steps'
import { type StepKind, type Workflow, stepName } from './workflow'

/** One step of a workflow as the person will meet it: what it is called, whether the run waits for them there, and what it asks of them. */
export interface PreviewRow {
  id: string
  kind: StepKind
  label: string
  stops: boolean
  says: string
}

const HELD = 'is held until the plan is approved and the findings are seen'

/** What each step of a workflow will ask of the person, from the step kinds alone, so a workflow written by hand or by the builder has one too. */
export function previewOf(wf: Workflow, switches: { planGate: boolean; mergeGate: boolean }): PreviewRow[] {
  return wf.steps.map((s) => {
    const row = (stops: boolean, says: string): PreviewRow => ({ id: s.id, kind: s.kind, label: stepName(s), stops, says })
    const gate = (inherited: boolean) => (s.gate !== undefined ? s.gate === 'approve' : inherited)
    switch (s.kind) {
      case 'plan':
        return gate(switches.planGate) ? row(true, 'you approve the plan before any edit') : row(false, 'the agent writes a plan; nothing waits for you')
      case 'work':
        return s.gate === 'approve' ? row(true, 'you approve it when the agent says it is done') : row(false, 'no stop')
      case 'check': {
        const tries = (s.retries ?? DEFAULT_RETRIES) + 1
        const must = s.gate === 'pass'
        return row(must, `the app runs \`${s.run ?? ''}\` (you approve the command once), up to ${tries} tries, and it ${must ? 'must pass' : 'only reports'}`)
      }
      case 'audit':
        return row(true, 'you look at the findings')
      case 'approve':
        return row(true, 'you approve it or send it back')
      default: {
        const held = gate(switches.mergeGate)
        const what = s.kind === 'pr' ? 'the push' : 'the merge into the base branch'
        if (held) return row(true, `${what} ${HELD}`)
        return row(false, s.kind === 'pr' ? 'nothing is held: the run ends when the branch is pushed' : 'nothing is held: the run ends when the branch is merged')
      }
    }
  })
}

/** Where the person stops, in a line for the preview's heading. */
export function stopsLine(rows: PreviewRow[]): string {
  const n = rows.filter((r) => r.stops).length
  if (n === 0) return 'Nothing waits for you.'
  if (n === 1) return 'You stop at 1 step.'
  return n === rows.length ? `You stop at all ${n} steps.` : `You stop at ${n} of ${rows.length} steps.`
}
