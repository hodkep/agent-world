import { type Reply, mentionedCode, parseReply } from '../shared/remoteReply'

/** One word a person may type for a waiting decision: `usage` and `does` say CODE where the decision's code goes. */
export interface Way {
  verb: string
  usage: string
  does: string
}

/** A decision waiting on the person for one agent, as the office keeps it: what it is called by (the code), the words that answer it, and what each does. */
export interface Gate {
  /** What waits, in a few words ("the plan"): the agent says it to the person. */
  label: string
  code: string
  replies: Way[]
  /** Does what the card's button does, and returns what the agent is told. Throws a sentence when the answer cannot be taken (a question still open). */
  apply: (reply: Reply) => string
}

const verbsOf = (gates: Gate[]) => [...new Set(gates.flatMap((g) => g.replies.map((r) => r.verb)))]

/** The words the agent tells the person to type for a waiting decision, read from the gate. */
export function howToReply(gate: Gate): string {
  const ways = gate.replies.map((r) => `\`${r.usage.replaceAll('CODE', gate.code)}\` (${r.does.replaceAll('CODE', gate.code)})`)
  return `reply ${ways.length > 1 ? `${ways.slice(0, -1).join(', ')} or ${ways.at(-1)}` : ways[0]}`
}

/**
 * What a typed reply does: applied to the waiting decision it names, with what the agent is told; or, when it only mentions a code, what to tell the person.
 * Null when it is ordinary talk, or nothing waits.
 */
export function resolveReply(gates: Gate[], prompt: string): string | null {
  if (!gates.length) return null
  const reply = parseReply(prompt, verbsOf(gates))
  const gate = reply && gates.find((g) => g.code === reply.code)
  if (reply && gate) {
    if (!gate.replies.some((r) => r.verb === reply.verb)) return `The person replied \`${prompt.trim()}\`, but this decision does not take "${reply.verb}". Tell them to ${howToReply(gate)}.`
    try {
      return `The person replied \`${prompt.trim()}\`. ${gate.apply(reply)}`
    } catch (err) {
      return `The person replied \`${prompt.trim()}\`, but it was not applied: ${(err as Error).message} Tell them what is missing.`
    }
  }
  if (reply) return null
  const code = mentionedCode(prompt, gates.map((g) => g.code))
  const named = gates.find((g) => g.code === code)
  return named ? `The person's message names the waiting decision ${named.code}, but it is not exactly a decision, so nothing was decided. Please tell the person to ${howToReply(named)}.` : null
}

/** The sentence added to what the agent is told when a gate waits and the agent can be reached from a phone: say what waits, and how to answer. */
export function remoteHint(gates: Gate[]): string {
  if (!gates.length) return ''
  return `\n\nThis agent is under remote control, so the person may be on a phone: tell them in the conversation what is waiting, and ask them to type one of the replies below exactly as written. ${gates.map((g) => `For ${g.label}: ${howToReply(g)}.`).join(' ')}`
}

/** Is this message a decision on a waiting gate, or does it use a waiting code: the only messages whose origin matters. */
export function touches(gates: Gate[], prompt: string): boolean {
  if (!gates.length) return false
  const reply = parseReply(prompt, verbsOf(gates))
  if (reply) return gates.some((g) => g.code === reply.code)
  return mentionedCode(prompt, gates.map((g) => g.code)) !== null
}

/** What the agent is told when words that look like a decision could not be shown to come from the person: nothing was decided. */
export const UNPROVEN = 'A message that looks like a decision on a waiting gate arrived, but it could not be shown to come from the person, so nothing was decided. Ask the person to answer in the app, or to type it again.'
