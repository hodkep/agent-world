/**
 * The read-back block at the top of a plan: what the agent understood, said in a fixed shape so the app can check it in code
 * (no model call) and show it to the person before anything is built.
 */
export interface Assumption {
  kind: 'given' | 'guessed'
  text: string
}
export interface PlanQuestion {
  text: string
  options: string[]
  /** Set when the question came from the intent check at the max dial, not from the agent's own plan. */
  source?: 'check'
}
export interface PlanReadback {
  goal: string
  assumptions: Assumption[]
  outOfScope: string[]
  questions: PlanQuestion[]
}
export type PlanResult = { ok: true; plan: PlanReadback } | { ok: false; problems: string[] }

const GOAL_MAX = 240
const SECTIONS = ['goal', 'assumptions', 'out of scope', 'open questions'] as const

/** Lines under each of the four headings, by name; the first heading of a name wins and every other heading is ignored. */
function sections(md: string) {
  const found = new Map<string, string[]>()
  let current: string[] | null = null
  for (const line of md.split('\n')) {
    const h = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line)
    if (h) {
      const name = h[1]!.toLowerCase()
      current = (SECTIONS as readonly string[]).includes(name) && !found.has(name) ? (found.set(name, []), found.get(name)!) : null
    } else current?.push(line)
  }
  return found
}

const bullet = (line: string) => /^(\s*)[-*]\s+(.*\S)\s*$/.exec(line)
const isNone = (lines: string[]) => lines.filter((l) => l.trim()).length === 1 && /^none\.?$/i.test(lines.find((l) => l.trim())!.trim())

/** What stands under a heading as a list: bullets, or a lone "none" meaning nothing. */
function items(lines: string[]): string[] {
  if (isNone(lines)) return []
  return lines.filter((l) => l.trim()).map((l) => bullet(l)?.[2] ?? l.trim())
}

export function parsePlan(md: string): PlanResult {
  const s = sections(md)
  const problems: string[] = []
  const plan: PlanReadback = { goal: '', assumptions: [], outOfScope: [], questions: [] }

  const goalLines = s.get('goal')?.filter((l) => l.trim()) ?? null
  if (!goalLines) problems.push('Missing "## Goal": write the goal in one line.')
  else if (goalLines.length === 0) problems.push('Goal is empty: write the goal in one line under "## Goal".')
  else if (goalLines.length > 1) problems.push('Goal must be one line.')
  else if (goalLines[0]!.trim().length > GOAL_MAX) problems.push(`Goal is over ${GOAL_MAX} characters: say it in one line.`)
  else plan.goal = goalLines[0]!.trim()

  const assumed = s.get('assumptions')
  if (!assumed) problems.push('Missing "## Assumptions": list what you took as given or guessed, or write "none".')
  else {
    for (const text of items(assumed)) {
      const m = /^\[(given|guessed)\]\s*(.*)$/i.exec(text)
      if (m) plan.assumptions.push({ kind: m[1]!.toLowerCase() as Assumption['kind'], text: m[2]! })
      else problems.push(`Assumption "${text}" starts with neither [given] nor [guessed].`)
    }
  }

  const scope = s.get('out of scope')
  if (!scope) problems.push('Missing "## Out of scope": list what you will not do, or write "none".')
  else plan.outOfScope = items(scope)

  const asked = s.get('open questions')
  if (!asked) problems.push('Missing "## Open questions": list what you need to ask, or write "none".')
  else if (!isNone(asked)) {
    for (const line of asked) {
      const b = bullet(line)
      if (!b) continue
      if (b[1]!.length === 0) plan.questions.push({ text: b[2]!, options: [] })
      else plan.questions.at(-1)?.options.push(b[2]!)
    }
  }

  return problems.length ? { ok: false, problems } : { ok: true, plan }
}

/** What the office types into the agent after the person answers its plan. */
export function planReply(state: 'approved' | 'changes' | 'released', o: { note?: string; answers?: { question: string; answer: string }[] }): string {
  const answers = o.answers?.length ? `\nTheir answers:\n${o.answers.map((a) => `- ${a.question} ${a.answer}`).join('\n')}` : ''
  if (state === 'released') return 'The person lifted the hold on your edits without approving the plan. Go ahead.'
  if (state === 'approved') return `Your plan was approved. Go ahead and build it.${o.note?.trim() ? `\nTheir note: ${o.note.trim()}` : ''}${answers}`
  return `The person asked for changes to your plan.${o.note ? `\n${o.note}` : ''}${answers}\nRevise .agent-world/plan.md and call plan_submit again. Do not edit yet.`
}

/** Questions with no answer yet: each blocks approving the plan. An answer is a choice or some words. */
export const unanswered = (plan: PlanReadback, answers: Record<string, string>) => plan.questions.filter((q) => !answers[q.text]?.trim()).map((q) => q.text)

/** The answers given, in the order the questions were asked, as the agent is told them. */
export const answersOf = (plan: PlanReadback, answers: Record<string, string>) =>
  plan.questions.filter((q) => answers[q.text]?.trim()).map((q) => ({ question: q.text, answer: answers[q.text]!.trim() }))
