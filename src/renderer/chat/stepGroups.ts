import type { BrowserGroup } from './browserGroup'
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
export function groupSteps(rows: (Row | BrowserGroup)[]): (Row | StepGroup | BrowserGroup)[] {
  const out: (Row | StepGroup | BrowserGroup)[] = []
  let run: Step[] = []
  const flush = () => {
    if (run.length > 1 && run.some((s) => s.kind === 'tool')) out.push({ kind: 'group', id: run[0]!.id, steps: run })
    else out.push(...run)
    run = []
  }
  for (const r of rows) {
    if (r.kind !== 'browser' && isStep(r)) run.push(r)
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

const TEST_RUN = /\b(?:vitest|jest|pytest|mocha|rspec|phpunit|run-tests\.mjs|go\s+test|cargo\s+test|dotnet\s+test|mvn\s+test|gradle\s+test|playwright\s+test|node\s+--test|(?:npm|pnpm|yarn|bun)(?:\s+run)?\s+test)\b/
const lastCount = (re: RegExp, text: string) => {
  let k: number | null = null
  for (const m of text.matchAll(re)) k = Number(m[1])
  return k
}

/**
 * How a test run went, from the runner's own counts ("41 passed", "2 failed", node's "# pass 2"). Without counts nothing is said: agents pipe their
 * commands into `tail`, which hides the exit code, so a run that failed can look like one that passed.
 */
export function testResult(command: string, text: string): { text: string; bad: boolean } | null {
  if (!TEST_RUN.test(command)) return null
  const failed = lastCount(/(\d+) failed/g, text) ?? lastCount(/^# fail (\d+)$/gm, text)
  const passed = lastCount(/(\d+) passed/g, text) ?? lastCount(/^# pass (\d+)$/gm, text)
  if (failed) return { text: `tests ${failed} failed`, bad: true }
  return passed !== null ? { text: `tests ${passed} passed`, bad: false } : null
}

/** What a folded run of steps did, result first (the files read, the searches, the commands), and how its last test run went. */
export function groupLabel(steps: Extract<Row, { kind: 'tool' }>[]): { text: string; tests?: { text: string; bad: boolean } } {
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  const read = new Set<string>()
  let searched = 0
  let web = 0
  let ran = 0
  let tests: { text: string; bad: boolean } | null = null
  for (const { run } of steps) {
    if (run.name === 'Read') read.add(str(run.input.file_path))
    else if (run.name === 'Grep' || run.name === 'Glob') searched++
    else if (run.name === 'WebFetch' || run.name === 'WebSearch') web++
    else if (run.name === 'Bash') {
      ran++
      tests = (run.result && testResult(str(run.input.command), run.result.text)) || tests
    }
  }
  const plural = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`
  const text = [read.size && `Read ${plural(read.size, 'file', 'files')}`, searched && `searched ${searched}`, web && `looked up ${web} on the web`, ran && `ran ${plural(ran, 'command', 'commands')}`].filter(Boolean).join(' · ')
  return { text: text && text[0]!.toUpperCase() + text.slice(1), ...(tests && { tests }) }
}
