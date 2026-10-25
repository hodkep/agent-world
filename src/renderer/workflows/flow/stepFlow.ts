import { DEFAULT_RETRIES } from '../../../shared/steps'
import type { SkillState } from '../../../shared/skills'
import type { Step, StepKind } from '../../../shared/workflow'

/** Who does a step: the agent, a command the app runs, a model that reviews, or the person. */
export type Actor = 'agent' | 'command' | 'reviewer' | 'you'
export const ACTOR: Record<StepKind, Actor> = { plan: 'agent', work: 'agent', check: 'command', audit: 'reviewer', approve: 'you', pr: 'agent', merge: 'you' }
export const ACTOR_WORD: Record<Actor, string> = { agent: 'agent', command: 'command', reviewer: 'reviewer', you: 'you' }

/** A step card's height and the gap below it: the flow runs top to bottom, one pitch per step. */
export const NODE_H = 96
export const GAP = 60
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
  tone: 'stop' | 'pass' | 'run' | 'plain'
  /** A skill chip: how that skill stands in this project, when it is not simply ready. */
  skill?: SkillState
}
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** What a step card says besides its name: who has to act, and what it is given. */
export function chipsOf(s: Step, states: Record<string, SkillState> = {}, switches?: { planGate: boolean; mergeGate: boolean }): Chip[] {
  const out: Chip[] = []
  const landing = s.kind === 'pr' || s.kind === 'merge'
  if (s.kind === 'approve' || (s.gate === 'approve' && (s.kind === 'plan' || s.kind === 'work' || s.kind === 'audit'))) out.push({ text: 'you approve', tone: 'stop' })
  else if (s.kind === 'plan' && s.gate === undefined && switches?.planGate) out.push({ text: 'you approve', tone: 'stop' })
  else if (landing && s.gate === 'approve') out.push({ text: 'you confirm', tone: 'stop' })
  // No gate of its own: the Settings switch decides, said as what it comes to when the switches are known.
  else if (landing && s.gate === undefined) {
    if (!switches) out.push({ text: 'follows the switch', tone: 'plain' })
    else if (switches.mergeGate) out.push({ text: 'you confirm', tone: 'stop' })
  }
  if (s.kind === 'check') {
    if (s.gate === 'approve') out.push({ text: 'you approve', tone: 'stop' })
    if (s.gate === 'pass' || s.gate === 'approve') out.push({ text: 'must pass', tone: 'pass' })
    out.push({ text: plural(s.retries ?? DEFAULT_RETRIES, 'retry', 'retries'), tone: 'plain' })
  }
  if (s.start === 'run') out.push({ text: 'starts when you press Run', tone: 'run' })
  if (s.optional) out.push({ text: 'optional', tone: 'plain' })
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
/** What a step's brief is for, as the field's hint says it: every kind takes one. */
export const BRIEF_HINT: Record<StepKind, string> = {
  plan: 'What the agent should do here (optional)',
  work: 'What the agent should do here (optional)',
  check: 'What this check is for (optional)',
  audit: 'What the reviewer should look at (optional)',
  approve: 'What you are asked to approve (optional)',
  pr: 'What the agent should put in the pull request (optional)',
  merge: 'A note for whoever lands it (optional)'
}
/** The kinds a person can press Run on, and so choose to start that way. */
export const RUN_KINDS: StepKind[] = ['check', 'audit', 'pr']
