import { DEFAULT_RETRIES } from '../../../shared/steps'
import type { SkillState } from '../../../shared/skills'
import type { Step, StepKind } from '../../../shared/workflow'

/** Who does a step: the agent, a command the app runs, a model that reviews, or the person. */
export type Actor = 'agent' | 'command' | 'reviewer' | 'you'
export const ACTOR: Record<StepKind, Actor> = { plan: 'agent', work: 'agent', check: 'command', audit: 'reviewer', approve: 'you', pr: 'agent', merge: 'you' }
export const ACTOR_WORD: Record<Actor, string> = { agent: 'agent', command: 'command', reviewer: 'reviewer', you: 'you' }

/** A step card's height and the gap below it: the flow runs top to bottom, one pitch per step. */
export const NODE_H = 96
export const GAP = 36
export const PITCH = NODE_H + GAP
export const positionOf = (i: number) => ({ x: 0, y: i * PITCH })

/** The place in the list a step dropped at height `y` belongs: the nearest one, never outside the list. */
export const dropIndex = (y: number, count: number) => Math.min(count - 1, Math.max(0, Math.round(y / PITCH)))

/** A loop drawn back up the flow: where the work goes again, from a check that must pass (a retry) or a step the person can send back. */
export interface Loop {
  from: number
  to: number
  kind: 'back' | 'retry'
}
export function loopsOf(steps: Step[]): Loop[] {
  const out: Loop[] = []
  steps.forEach((s, from) => {
    const stops = s.gate === 'approve' || (s.kind === 'check' && s.gate === 'pass') || (s.kind === 'approve')
    if (!stops) return
    const to = steps.slice(0, from).map((x) => x.kind).lastIndexOf('work')
    if (to >= 0) out.push({ from, to, kind: s.kind === 'check' ? 'retry' : 'back' })
  })
  return out
}

export interface Chip {
  text: string
  tone: 'stop' | 'pass' | 'plain'
  /** A skill chip: how that skill stands in this project, when it is not simply ready. */
  skill?: SkillState
}
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** What a step card says besides its name: who has to act, and what it is given. */
export function chipsOf(s: Step, states: Record<string, SkillState> = {}): Chip[] {
  const out: Chip[] = []
  if (s.kind === 'approve' || (s.gate === 'approve' && (s.kind === 'plan' || s.kind === 'work' || s.kind === 'audit'))) out.push({ text: 'you approve', tone: 'stop' })
  else if ((s.kind === 'pr' || s.kind === 'merge') && s.gate === 'approve') out.push({ text: 'you confirm', tone: 'stop' })
  else if ((s.kind === 'pr' || s.kind === 'merge') && s.gate === undefined) out.push({ text: 'follows the switch', tone: 'plain' })
  if (s.kind === 'check') {
    if (s.gate === 'pass') out.push({ text: 'must pass', tone: 'pass' })
    out.push({ text: plural(s.retries ?? DEFAULT_RETRIES, 'try', 'tries'), tone: 'plain' })
  }
  for (const id of s.skills ?? []) out.push({ text: `skill: ${id}`, tone: 'plain', ...(states[id] && states[id] !== 'ready' && { skill: states[id] }) })
  return out
}

/** How each kind is named on a card and in the editor. */
export const KIND_LABEL: Record<StepKind, string> = { plan: 'plan', work: 'work', check: 'check', audit: 'review', approve: 'your approval', pr: 'pull request', merge: 'land' }
/** What the Stop choice of each kind says, per gate. */
export const GATE_WORDS: Record<StepKind, Record<string, string>> = {
  plan: { auto: 'no stop', approve: 'you approve' },
  work: { auto: 'no stop', approve: 'you approve' },
  check: { auto: 'only reports', pass: 'must pass' },
  audit: { auto: 'no stop', approve: 'you approve' },
  approve: { approve: 'you approve' },
  pr: { auto: 'follows the switch', approve: 'you confirm' },
  merge: { auto: 'follows the switch', approve: 'you confirm' }
}
/** The kinds that take a brief: what the agent (or the person) is told at that step. */
export const BRIEF_KINDS: StepKind[] = ['plan', 'work', 'approve']
