import { type Reply, mentionedCode, parseReply } from '../shared/remoteReply'

export type GateKind = 'plan' | 'step' | 'audit' | 'push'

/** A decision waiting on the person for one agent, as the office keeps it: what it is called by (the code) and what a word does to it. */
export interface Gate {
  kind: GateKind
  code: string
  /** Does what the card's button does, and returns what the agent is told. Throws a sentence when the answer cannot be taken (a question still open). */
  apply: (reply: Reply) => string
}

const WORDS: Record<GateKind, string[]> = { plan: ['approve', 'changes', 'release'], step: ['approve', 'changes'], audit: ['seen', 'plan', 'aside'], push: ['allow', 'decline'] }

/** The words the agent tells the person to type for a waiting decision. */
export function howToReply(kind: GateKind, code: string): string {
  switch (kind) {
    case 'plan':
      return `reply \`approve ${code}\` (or \`approve ${code} 1=2, 2=words\` to answer its questions), \`changes ${code}: what to change\`, or \`release ${code}\``
    case 'step':
      return `reply \`approve ${code}\` or \`changes ${code}: what to change\``
    case 'audit':
      return `reply \`seen ${code}\` (or \`seen ${code} 1,3\`), \`plan ${code} 2\` to add an out-of-scope finding to the plan, or \`aside ${code}\``
    case 'push':
      return `reply \`allow ${code}\` or \`decline ${code}\``
  }
}

/**
 * What a typed reply does: applied to the waiting decision it names, with what the agent is told; or, when it only mentions a code, what to tell the person.
 * Null when it is ordinary talk, or nothing waits.
 */
export function resolveReply(gates: Gate[], prompt: string): string | null {
  if (!gates.length) return null
  const reply = parseReply(prompt)
  const gate = reply && gates.find((g) => g.code === reply.code)
  if (reply && gate) {
    if (!WORDS[gate.kind].includes(reply.verb)) return `The person replied \`${prompt.trim()}\`, but this decision does not take "${reply.verb}". Tell them to ${howToReply(gate.kind, gate.code)}.`
    try {
      return `The person replied \`${prompt.trim()}\`. ${gate.apply(reply)}`
    } catch (err) {
      return `The person replied \`${prompt.trim()}\`, but it was not applied: ${(err as Error).message} Tell them what is missing.`
    }
  }
  if (reply) return null
  const code = mentionedCode(prompt, gates.map((g) => g.code))
  const named = gates.find((g) => g.code === code)
  return named ? `The person's message names the waiting decision ${named.code}, but it is not exactly a decision, so nothing was decided. Please tell the person to ${howToReply(named.kind, named.code)}.` : null
}

const LABEL: Record<GateKind, string> = { plan: 'the plan', step: 'the step waiting for approval', audit: 'the audit findings', push: 'the held push' }

/** The sentence added to what the agent is told when a gate waits and the agent can be reached from a phone: say what waits, and how to answer. */
export function remoteHint(gates: Gate[]): string {
  if (!gates.length) return ''
  return `\n\nThis agent is under remote control, so the person may be on a phone: tell them in the conversation what is waiting. ${gates.map((g) => `For ${LABEL[g.kind]}: ${howToReply(g.kind, g.code)}.`).join(' ')}`
}

/** Is this message a decision on a waiting gate, or does it use a waiting code: the only messages whose origin matters. */
export function touches(gates: Gate[], prompt: string): boolean {
  if (!gates.length) return false
  const reply = parseReply(prompt)
  if (reply) return gates.some((g) => g.code === reply.code)
  return mentionedCode(prompt, gates.map((g) => g.code)) !== null
}

/** What the agent is told when words that look like a decision could not be shown to come from the person: nothing was decided. */
export const UNPROVEN = 'A message that looks like a decision on a waiting gate arrived, but it could not be shown to come from the person, so nothing was decided. Ask the person to answer in the app, or to type it again.'
