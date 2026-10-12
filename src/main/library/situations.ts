export interface Situation {
  kind: string
  /** A few words on how big it is, for the line the agent gets and the log. */
  detail: string
}

/** What a situation is called to a person (the log and the cards say "because a merge conflict was found"). */
export const SITUATIONS: Record<string, string> = { 'merge-conflict': 'merge conflict' }

const text = (response: unknown): string => {
  if (typeof response === 'string') return response
  if (response && typeof response === 'object') {
    const r = response as Record<string, unknown>
    return [r.stdout, r.stderr, r.output, r.content, r.file && typeof r.file === 'object' ? (r.file as Record<string, unknown>).content : ''].filter((x) => typeof x === 'string').join('\n')
  }
  return ''
}

const GIT = /CONFLICT \([^)]*\):|Automatic merge failed|error: could not apply|Unmerged paths:|^<<<<<<< .+$/m

/** Whether what a tool returned shows the agent has reached a situation the playbook may have something for. Plain pattern matching: it costs no tokens. */
export function detectSituation(_tool: string, _input: Record<string, unknown>, response: unknown): Situation | null {
  const out = text(response)
  if (!out || !GIT.test(out)) return null
  const files = new Set([...out.matchAll(/Merge conflict in (\S+)/g)].map((m) => m[1]))
  for (const m of out.matchAll(/^\s*(?:both modified|both added|deleted by \w+|added by \w+):\s+(\S+)/gm)) files.add(m[1]!)
  return { kind: 'merge-conflict', detail: files.size ? `${files.size} file${files.size === 1 ? '' : 's'}` : 'conflict markers' }
}
