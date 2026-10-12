export interface Situation {
  kind: string
  /** A few words on how big it is, for the line the agent gets and the log. */
  detail: string
}

/** What makes it trivial enough to pass over, in the line the agent gets. */
export const TRIVIAL: Record<string, string> = { 'merge-conflict': 'one small hunk, nothing both sides changed', 'failing-checks': 'a typo or a one-line fix you already know' }

/** What a situation is called to a person (the log and the cards say "because a merge conflict was found"). */
export const SITUATIONS: Record<string, string> = { 'merge-conflict': 'merge conflict', 'failing-checks': 'failing test or type check' }

export const outputOf = (response: unknown): string => {
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
  const out = outputOf(response)
  if (!out) return null
  if (!GIT.test(out)) return failing(out)
  const files = new Set([...out.matchAll(/Merge conflict in (\S+)/g)].map((m) => m[1]))
  for (const m of out.matchAll(/^\s*(?:both modified|both added|deleted by \w+|added by \w+):\s+(\S+)/gm)) files.add(m[1]!)
  return { kind: 'merge-conflict', detail: files.size ? `${files.size} file${files.size === 1 ? '' : 's'}` : 'conflict markers' }
}

const TS = /error TS\d+:/g
const TEST_FAILED = /\b\d+ failed\b|^--- FAIL:|^FAIL\b|\bTests?:\s+\d+ failed|npm ERR! Test failed/m
const TEST_PASSED = /\b\d+ passed\b|^ok\s+\S+|\bFound 0 errors\b/m

function failing(out: string): Situation | null {
  const types = out.match(TS)
  if (types) return { kind: 'failing-checks', detail: `${types.length} type error${types.length === 1 ? '' : 's'}` }
  return TEST_FAILED.test(out) ? { kind: 'failing-checks', detail: 'tests failed' } : null
}

/** A green run of tests or a clean typecheck: the failures before it are over. */
export function checksPassed(out: string): boolean {
  return TEST_PASSED.test(out) && !TEST_FAILED.test(out) && !out.match(TS)
}

/** How many times a situation must show, with nothing green in between, before it is worth saying: one red run is how work goes, the same red again is being stuck. */
export const REPEATS: Record<string, number> = { 'merge-conflict': 1, 'failing-checks': 2 }
