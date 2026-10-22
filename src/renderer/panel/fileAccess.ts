export interface FileAccess {
  /** What is done to the file, in capitals for its tag. */
  kind: string
  path: string
  /** Why the program asks ("outside workspace"), when it says. */
  reason: string
  /** The lines a new file would have, or what an edit takes out and puts in. */
  diff: { sign: '+' | '-'; text: string; n: number }[]
  /** "+1 -1": how much changes, as the program counts it. */
  summary: string
}

const KINDS: Record<string, string> = { Read: 'READ', Create: 'NEW FILE', Edit: 'EDIT' }

/** A file question's words (the lines of the program's box above its answers) as a path, a reason and a change, for the card. `tool` names what is done. */
export function fileAccess(tool: string, detail: string): FileAccess {
  const out: FileAccess = { kind: KINDS[tool] ?? tool.toUpperCase(), path: '', reason: '', diff: [], summary: '' }
  const lines = detail.split('\n').map((l) => l.trim()).filter(Boolean)
  for (const [i, l] of lines.entries()) {
    const reason = /^Reason:\s*(.+)$/.exec(l)
    const named = /^\w+:\s+(\/\S.*)$/.exec(l)
    const sized = /^(\S.*?)\s{2,}([+-]\d+(?:\s+[+-]\d+)?)$/.exec(l)
    const row = /^(\d+)\s+([+-])\s+(.*)$/.exec(l)
    if (reason) out.reason = reason[1]!
    else if (row) out.diff.push({ sign: row[2] as '+' | '-', text: row[3]!, n: Number(row[1]) })
    else if (i === 0 && named) out.path = named[1]!
    else if (i === 0 && sized) ((out.path = sized[1]!), (out.summary = sized[2]!))
    else if (i === 0) out.path = l
  }
  return out
}
