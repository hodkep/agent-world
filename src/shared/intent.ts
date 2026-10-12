import type { ChatItem } from './chat'
import type { PlanQuestion, PlanReadback } from './plan'
import { jsonIn } from './reply'

const INSTRUCTION = `A person asked a coding agent for something. The agent wrote down what it understood (the plan below). Decide whether the plan leaves open anything the person must decide before any code is written.
Most requests are clear enough, and the right answer is an empty list. Report a gap only when BOTH are true:
- two competent engineers could build visibly different things from this request and plan, and
- the difference would matter to the person (what the product does, what data is kept or lost, what it costs), not just to the code.
A request that names the exact file, value or behaviour is clear: report nothing. Never ask about error handling, edge cases, tests, naming, logging, style, how to check the work, or anything an engineer would sensibly decide alone. Never repeat something the plan already says or asks.
At most three gaps. Each is one question the person can answer, with two to four short choices.
Reply with JSON only, in this shape: {"gaps":[{"question":"one sentence","options":["choice","choice"]}]}. {"gaps":[]} is the usual answer.`

const REQUEST_MAX = 4000
const GAPS_MAX = 3
const OPTIONS_MAX = 4
const QUESTION_MAX = 300
const OPTION_MAX = 120

/** What a model is asked at max: the request in the person's words, and the plan as the agent read it back. */
export function intentPrompt(request: string, plan: PlanReadback): { prompt: string } {
  const list = (items: string[]) => (items.length ? items.map((i) => `- ${i}`).join('\n') : '- none')
  const cut = request.length > REQUEST_MAX
  const prompt = [
    INSTRUCTION,
    `## Request${cut ? ' (the start of the request was cut)' : ''}\n${cut ? request.slice(-REQUEST_MAX) : request}`,
    `## Goal\n${plan.goal}`,
    `## Assumptions\n${list(plan.assumptions.map((a) => `[${a.kind}] ${a.text}`))}`,
    `## Out of scope\n${list(plan.outOfScope)}`,
    `## Open questions already asked\n${list(plan.questions.map((q) => q.text))}`
  ].join('\n\n')
  return { prompt }
}

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s)

function gap(raw: unknown): PlanQuestion | null {
  if (typeof raw !== 'object' || raw === null) return null
  const g = raw as Record<string, unknown>
  const text = typeof g.question === 'string' ? g.question.trim() : ''
  if (!text) return null
  const options = (Array.isArray(g.options) ? g.options : []).flatMap((o) => (typeof o === 'string' && o.trim() ? [clip(o.trim(), OPTION_MAX)] : [])).slice(0, OPTIONS_MAX)
  return { text: clip(text, QUESTION_MAX), options, source: 'check' }
}

/** The gaps in a reply as plan questions marked as the check's, or null when the reply holds no list of gaps. */
export function parseIntent(reply: string): PlanQuestion[] | null {
  const found = jsonIn(reply) as { gaps?: unknown } | null
  if (!Array.isArray(found?.gaps)) return null
  return found.gaps.flatMap((g) => gap(g) ?? []).slice(0, GAPS_MAX)
}

/** What the person asked: their last three messages, oldest first, leaving out what the office typed into the agent on its own. */
export function requestOf(items: ChatItem[]): string {
  return items
    .flatMap((i) => (i.kind === 'user' && !i.text.startsWith('[Agent World]') ? [i.text.trim()] : []))
    .filter(Boolean)
    .slice(-3)
    .join('\n\n')
}
