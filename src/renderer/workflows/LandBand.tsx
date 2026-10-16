import { useEffect, useState } from 'react'
import type { LandingHold } from '../../shared/api'
import type { FindingKind } from '../../shared/audit'
import type { MergeCheck } from '../../shared/mergeCheck'
import { OutlineIcon } from '../panel/IconButton'

const KIND: Record<FindingKind, string> = { 'out-of-scope': 'out of scope', 'goal-unmet': 'goal not met', 'guess-wrong': 'guess may be wrong' }

/**
 * Under the run's track while git holds the agent's merge into the base branch: what holds it, the review's findings to tick as seen, and the person's word,
 * Land anyway or Not yet. The agent cannot press either; its next try after "Land anyway" goes through, and after the findings are all seen needs no word at all.
 */
export function LandBand({ hold, agentName }: { hold: LandingHold; agentName: string }) {
  const [status, setStatus] = useState<{ branch: string; base: string; merge?: MergeCheck | null } | null>(null)
  useEffect(() => {
    const load = () => void window.aw.finishStatus(hold.agentId).then(setStatus, () => undefined)
    load()
    // The review answers a while later, and findings are ticked from here: both change what holds the merge.
    return window.aw.onWorkflows(load)
  }, [hold.agentId, hold.head])
  const merge = status?.merge
  const blocking = merge ? merge.blocking : hold.held
  const audit = merge?.audit
  const findings = audit?.state === 'done' ? audit.findings : []
  const clear = !!merge && blocking.length === 0
  return (
    <div className="land-band" role="region" aria-label={`${agentName}'s merge is held`}>
      <h3>
        <span className="tag">Merge held</span>
        {status ? `${status.branch} → ${status.base}` : ''}
      </h3>
      <p>{clear ? `Nothing holds it now. Ask ${agentName} to merge again.` : blocking.join(' ')}</p>
      {findings.length > 0 && (
        <ul className="lb-find" aria-label="What the review found">
          {findings.map((f, i) => (
            <li key={`${i}-${f.text}`}>
              <button className={`lb-tick ${f.seen ? 'on' : ''}`} role="checkbox" aria-checked={f.seen} aria-label={`Seen: ${f.text}`} disabled={f.seen} onClick={() => void window.aw.finishSeen(hold.agentId, [i])}>
                {f.seen && <OutlineIcon name="tick" size={10} />}
              </button>
              <span>
                {f.text}
                <small>{[KIND[f.kind], f.file].filter(Boolean).join(' · ')}</small>
              </span>
            </li>
          ))}
        </ul>
      )}
      {audit?.state === 'running' && <p className="lb-note">The review is running…</p>}
      <div className="lb-acts">
        {!clear && <button className="lb-go" onClick={() => void window.aw.landingAllow(hold.agentId)}>Land anyway</button>}
        <button className="lb-ghost" onClick={() => void window.aw.landingDecline(hold.agentId)}>{clear ? 'Close' : 'Not yet'}</button>
        {findings.some((f) => !f.seen) && <span className="lb-why">Marking each seen lets it land without asking.</span>}
      </div>
    </div>
  )
}
