export interface LandStatus {
  branch: string
  base: string
  ahead: number
  uncommitted: number
  baseReady: boolean
  conflicts: string[]
  unrelated: boolean
}

/** The checklist above Land: each line a tick or a cross, and Land waits until every one is a tick. */
export function landChecks(s: LandStatus): { ok: boolean; text: string }[] {
  const committed = { ok: s.uncommitted === 0, text: s.uncommitted === 0 ? 'Everything is committed' : `${s.uncommitted} file${s.uncommitted === 1 ? '' : 's'} not committed yet (commit in the Code tab)` }
  const checkout = { ok: s.baseReady, text: s.baseReady ? `Your checkout is on ${s.base} with nothing uncommitted` : `Your own checkout must be on ${s.base} with nothing uncommitted` }
  // With no merge base the commits cannot be counted and a merge would be refused: one cross says it, and the lines about commits and conflicts are left out.
  if (s.unrelated) return [{ ok: false, text: `This branch does not come from ${s.base}'s history: reset it onto ${s.base} before landing` }, committed, checkout]
  return [
    { ok: s.ahead > 0, text: s.ahead > 0 ? `${s.ahead} commit${s.ahead === 1 ? '' : 's'} on ${s.branch} to land` : `Nothing to land: ${s.base} already has everything on ${s.branch}` },
    committed,
    checkout,
    { ok: s.conflicts.length === 0, text: s.conflicts.length === 0 ? `No conflicts with ${s.base}` : `Would conflict in ${s.conflicts.join(', ')}` }
  ]
}
