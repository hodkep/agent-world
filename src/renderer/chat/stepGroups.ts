import type { Row } from './format'

/** The steps an agent takes on its way to an answer: they fold together. Edits, questions, plans, watchers and subagents stay cards of their own. */
const STEP_TOOLS = new Set(['Bash', 'Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch', 'ToolSearch'])

export type Step = Extract<Row, { kind: 'tool' | 'thinking' }>
export interface StepGroup {
  kind: 'group'
  /** The first step's id. */
  id: string
  steps: Step[]
}

const isStep = (r: Row): r is Step => r.kind === 'thinking' || (r.kind === 'tool' && STEP_TOOLS.has(r.run.name))

/** Runs of two or more steps between other rows become one group. A message, or a card of another kind, ends it. */
export function groupSteps(rows: Row[]): (Row | StepGroup)[] {
  const out: (Row | StepGroup)[] = []
  let run: Step[] = []
  const flush = () => {
    if (run.length > 1 && run.some((s) => s.kind === 'tool')) out.push({ kind: 'group', id: run[0]!.id, steps: run })
    else out.push(...run)
    run = []
  }
  for (const r of rows) {
    if (isStep(r)) run.push(r)
    else (flush(), out.push(r))
  }
  flush()
  return out
}

/** What a group says about itself in one line. */
export function groupSummary(steps: Step[]) {
  let commands = 0
  let failed = 0
  let sec = 0
  let running = false
  for (const s of steps) {
    if (s.kind === 'thinking') sec += s.took ?? 0
    else {
      commands++
      sec += s.run.sec ?? 0
      if (s.run.result?.isError) failed++
      if (!s.run.result) running = true
    }
  }
  return { commands, failed, sec, running }
}
