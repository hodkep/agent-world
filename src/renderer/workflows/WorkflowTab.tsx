import { type TileKind, headline, weekDays } from '../../shared/insights'
import type { Run } from '../../shared/runs'
import { type RunSpend, formatCost, runsThisWeek } from '../../shared/runStats'
import { landingPill, trackOf } from '../../shared/runTrack'
import type { StepContext } from '../../shared/steps'
import { RunTrack } from './RunTrack'
import { useLandingHolds } from './useLandingHolds'

const VERDICT: Record<TileKind, string> = { ok: 'met every gate', trouble: 'met its gates, with trouble on the way', bad: 'a gate was missed or overridden', wait: 'waiting', na: 'no gates asked' }

/**
 * One agent's Workflow tab: where its latest run stands now (the track, with the agent on its station), then its week as a tile for each run, by the day it began.
 * A tile opens that run in the Workflows window, and so does the link under them; the window is where a run's history is told.
 */
export function WorkflowTab({ agentName, agentId, runs, spend, ctxFor, onOpenRun }: { agentName: string; agentId: string; runs: Run[]; spend: Record<string, RunSpend>; ctxFor: (r: Run) => StepContext; /** Open the window on this run, or on its Runs when none is given. */ onOpenRun: (runId?: string) => void }) {
  const now = Date.now()
  const hold = useLandingHolds().find((h) => h.agentId === agentId)
  const mine = runs.filter((r) => r.agent === agentId)
  if (mine.length === 0)
    return (
      <div className="wf-tab">
        <div className="wf-empty">
          <b>No runs for {agentName} yet</b>
          <p>A run appears when {agentName} starts a task, or commits work it did not announce.</p>
        </div>
      </div>
    )
  const latest = mine[mine.length - 1]!
  const track = trackOf(latest, ctxFor(latest))
  const week = runsThisWeek(mine, now)
  const h = headline(week, ctxFor, now)
  const usd = week.reduce((n, r) => n + (spend[r.id]?.usd ?? 0), 0)
  const verdict = h.finished === 0 ? 'Nothing finished yet this week.' : h.metEvery === h.finished ? 'Every finished run met its gates.' : `${h.metEvery} of ${h.finished} finished runs met every gate.`
  return (
    <div className="wf-tab">
      {track ? <RunTrack track={track} seed={agentId} agentName={agentName} landing={landingPill(hold)} /> : <p className="hint">Nothing is running for {agentName}. The last task was “{latest.title}”.</p>}
      <h5 className="wt-cap">This week · {week.length} run{week.length === 1 ? '' : 's'}</h5>
      <div className="wt-week" role="list" aria-label="This week">
        {weekDays(week, ctxFor, now).map((d) => (
          <div key={d.label} role="listitem" aria-label={d.label} className={`wt-day ${d.today ? 'today' : ''}`}>
            <small>{d.label}</small>
            {d.runs.map((r) => (
              <button key={r.id} className={`wt-tile ${r.kind}`} aria-label={`${r.title}: ${VERDICT[r.kind]}`} title={`${r.title}: ${VERDICT[r.kind]}`} onClick={() => onOpenRun(r.id)}>
                <span>{r.title}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
      <p className="wt-line">
        {verdict} {formatCost(usd)}. <button className="su-link" onClick={() => onOpenRun()}>All of {agentName}'s runs in Workflows ↗</button>
      </p>
    </div>
  )
}
