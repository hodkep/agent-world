import type { MergeCheck } from '../../shared/mergeCheck'

/** A line of the Finish checklist: a tick, a cross (holds Land back) or a plain line (`ok: null`) that never does. */
export interface MergeRow {
  ok: boolean | null
  text: string
}

/** The plan and audit lines of the checklist, then the notes. A cross carries the server's own words for what holds Land back. */
export function mergeRows(m: MergeCheck): MergeRow[] {
  const rows: MergeRow[] = []
  const planHeld = m.plan === 'waiting' || m.plan === 'changes' || m.plan === 'none'
  if (planHeld) rows.push({ ok: false, text: m.blocking[0] ?? 'The plan was not approved.' })
  else if (m.plan === 'approved') rows.push({ ok: true, text: 'Plan approved' })
  else if (m.plan === 'released') rows.push({ ok: true, text: 'Plan hold lifted without approval' })
  const a = m.audit
  let used = planHeld ? 1 : 0
  if (a.state === 'done') {
    const unseen = a.findings.filter((f) => !f.seen).length
    if (unseen) used++
    if (unseen) rows.push({ ok: false, text: m.blocking[planHeld ? 1 : 0] ?? `${unseen} audit findings have not been seen.` })
    else rows.push({ ok: true, text: a.findings.length ? `Audit: ${a.findings.length} finding${a.findings.length === 1 ? '' : 's'}, all seen` : 'Audit found nothing' })
  } else if (a.state === 'running') rows.push({ ok: null, text: 'Auditing the branch against the plan…' })
  else if (a.state === 'failed') rows.push({ ok: null, text: `Audit failed: ${a.reason}. Land is not held for this.` })
  else if (a.state === 'off' && a.reason === 'economy') rows.push({ ok: null, text: 'Audit is off at the economy dial.' })
  else if (a.state === 'off' && a.reason === 'provider') rows.push({ ok: null, text: 'Audit is not available for this program.' })
  else if (a.state === 'off' && a.reason === 'workflow') rows.push({ ok: null, text: 'This workflow has no audit step.' })
  // Whatever else holds landing (a step waiting for approval) comes in the server's words.
  for (const b of m.blocking.slice(used)) rows.push({ ok: false, text: b })
  for (const n of m.notes) rows.push({ ok: null, text: n })
  return rows
}
