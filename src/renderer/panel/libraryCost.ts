import { FORCED_CHECK_TOKENS } from '../../shared/library'

/** A guess at what one library_skip call and its answer add to the conversation, in tokens. */
const SKIP_TOKENS = 80
/** Sessions to price the check against: the check rides on the rulebook line, which is sent with the first message and every sixth one after while a rule is hard. */
const SCENARIOS = [
  { label: 'A short task', messages: 10 },
  { label: 'A normal session', messages: 50 },
  { label: 'A long day', messages: 200 }
]

/** What the check before acting adds, on assumptions people can read: tokens per message, per sample session, and per rule an agent passes over. */
export function checkCost() {
  return { perMessage: FORCED_CHECK_TOKENS, perSkip: SKIP_TOKENS, scenarios: SCENARIOS.map((s) => ({ ...s, tokens: Math.ceil(s.messages / 6) * FORCED_CHECK_TOKENS })) }
}

export const groupTokens = (n: number) => n.toLocaleString('en-US')

/** What the library and playbook add to an agent's context, on assumptions people can read: the opening text (at most the budget) once per session, and a line pointing at an item on some messages. */
export function libraryCost() {
  const openingMax = 300
  const perPointing = 60
  const sessions = [
    { label: 'A short task', pointings: 1 },
    { label: 'A normal session', pointings: 4 },
    { label: 'A long day', pointings: 15 }
  ]
  return { openingMax, perPointing, sessions: sessions.map((s) => ({ ...s, tokens: openingMax + s.pointings * perPointing })) }
}
