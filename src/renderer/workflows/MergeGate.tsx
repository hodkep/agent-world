import type { FindingKind } from '../../shared/audit'
import type { MergeCheck } from '../../shared/mergeCheck'
import { callSpend } from '../../shared/runStats'

const KIND: Record<FindingKind, string> = { 'out-of-scope': 'Out of scope', 'goal-unmet': 'Goal not met', 'guess-wrong': 'Guess wrong' }
const PLAN_TAG: Record<MergeCheck['plan'], { text: string; tone: string }> = {
  approved: { text: 'Plan approved', tone: 'ok' },
  released: { text: 'Plan not approved', tone: 'warn' },
  waiting: { text: 'Plan waiting', tone: 'warn' },
  changes: { text: 'Plan sent back', tone: 'warn' },
  none: { text: 'No plan', tone: 'warn' },
  'not-needed': { text: 'No plan needed', tone: 'dim' }
}

/** The block above Finish's checklist: the plan the person approved beside what a reviewer found in the branch against it. */
export function MergeGate({ merge, onSeen, onAgain }: { merge: MergeCheck; onSeen: (index: number) => void; onAgain: () => void }) {
  const a = merge.audit
  if (!merge.planned && a.state !== 'done' && a.state !== 'running' && a.state !== 'failed' && a.state !== 'not-run') return null
  const tag = PLAN_TAG[merge.plan]
  return (
    <fieldset className="mg">
      <legend>Against the plan</legend>
      {merge.planned && (
        <div className="mg-card">
          <div className="mg-row">
            <span className={`mg-tag ${tag.tone}`}>{tag.text}</span>
            <b>{merge.planned.goal}</b>
          </div>
          <span className="hint">{merge.planned.outOfScope.length ? `Out of scope: ${merge.planned.outOfScope.join(' ')}` : 'Nothing was listed as out of scope.'}</span>
          <span className="hint">
            {merge.commits} commit{merge.commits === 1 ? '' : 's'} in the task, {merge.flagged} outside it
          </span>
        </div>
      )}
      {a.state === 'running' && <span className="hint">Auditing the branch against the plan…</span>}
      {a.state === 'not-run' && (
        <div className="mg-row">
          <span className="hint">The audit has not run yet. It starts by itself once the agent reports its work and its checks pass, once per round; this runs it on the branch as it is now.</span>
          <button onClick={onAgain}>Run the audit now</button>
        </div>
      )}
      {a.state === 'failed' && (
        <div className="mg-row">
          <span className="hint">The audit failed: {a.reason}</span>
          <button onClick={onAgain}>Run the audit again</button>
        </div>
      )}
      {a.state === 'done' && (
        <>
          <ul className="mg-list" aria-label="What the audit found">
            {a.findings.map((f, i) => (
              <li key={`${i}-${f.text}`} className="mg-card">
                <div className="mg-row">
                  <span className="mg-tag warn">{KIND[f.kind]}</span>
                  {f.file && <b>{f.file}</b>}
                </div>
                <span className="hint">{f.text}</span>
                <label className="check">
                  <input type="checkbox" checked={f.seen} disabled={f.seen} onChange={() => onSeen(i)} /> Seen, fine
                </label>
              </li>
            ))}
          </ul>
          <span className="hint mg-cost">
            Audited {a.files} file{a.files === 1 ? '' : 's'}, {a.lines} lines{a.truncated ? ' (the diff was too big, so only the first files)' : ''}
            {a.model ? ` · ${a.model}` : ''}
            {callSpend(a)}
          </span>
        </>
      )}
    </fieldset>
  )
}
