export type HandoffKind = 'review' | 'continue' | 'answer'

export interface HandoffInput {
  kind: HandoffKind
  from: string
  branch: string
  base: string
  worktree: string
  note?: string
  /** The receiver is a new agent whose own branch was made from the sender's, so it already holds the commits. */
  fresh?: boolean
}

// Branch and folder names end up inside commands the receiver is told to run, so only characters they can safely hold are kept.
const safe = (s: string) => s.replace(/[^A-Za-z0-9._\/@+-]/g, '_')
const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 400)

const READ: Record<HandoffKind, (b: string, t: string) => string> = {
  review: (b, t) => `git diff ${t}...${b}`,
  continue: (b, t) => `git log ${t}..${b}`,
  answer: (b, t) => `git diff ${t}...${b} --stat`
}

/** What a receiver is told when work is handed to it. The first line is what the chat reads to draw it as a card. */
export function handoffText(i: HandoffInput): string {
  const b = safe(i.branch)
  const t = safe(i.base)
  const ask = {
    review: 'Look for bugs, missed edge cases, risky changes, and missing tests. Do not edit, commit or run anything that changes files.',
    continue: i.fresh
      ? `Your branch starts from ${b}, so their commits are already yours. Read the log first, then carry on from where they stopped.`
      : `Bring their commits into your branch first with: git merge ${b}. Then read the log and carry on from where they stopped.`,
    answer: 'Answer briefly and concretely.'
  }[i.kind]
  const note = oneLine(i.note ?? '')
  return [
    `Hand-off (${i.kind}) from ${i.from}: branch ${b}, based on ${t}.`,
    `Read it with: ${READ[i.kind](b, t)}`,
    `Uncommitted edits are in ${safe(i.worktree)}: read them with git -C ${safe(i.worktree)} diff.`,
    ask,
    note && `Note from ${i.from}: ${note}`
  ]
    .filter(Boolean)
    .join('\n')
}

export interface ParsedHandoff {
  kind: HandoffKind
  from: string
  branch: string
  base: string
  read: string
  note?: string
}

const first = /^Hand-off \((review|continue|answer)\) from ([^:\n]+): branch (\S+), based on (\S+)\.$/

/** A hand-off taken apart from the text a receiver was given; null for anything else. */
export function parseHandoff(text: string): ParsedHandoff | null {
  const lines = text.split('\n')
  const m = first.exec(lines[0] ?? '')
  if (!m) return null
  const read = lines.find((l) => l.startsWith('Read it with: '))?.slice('Read it with: '.length) ?? ''
  const note = lines.find((l) => l.startsWith(`Note from ${m[2]}: `))?.slice(`Note from ${m[2]}: `.length)
  return { kind: m[1] as HandoffKind, from: m[2]!, branch: m[3]!, base: m[4]!, read, ...(note && { note }) }
}
