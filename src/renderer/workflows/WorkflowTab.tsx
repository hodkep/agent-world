import { RestartBanner } from './RestartBanner'
import { type TileKind, headline, needsLook, weekDays } from '../../shared/insights'
import type { Run } from '../../shared/runs'
import { type RunSpend, formatCost, runsThisWeek } from '../../shared/runStats'
import { landingPill, trackOf } from '../../shared/runTrack'
import { landingKind } from '../../shared/workflow'
import type { StepContext } from '../../shared/steps'
import { useState } from 'react'
import { RunFlow } from './flow/RunFlow'
import { RunTrack } from './RunTrack'
import { useLandingHolds } from './useLandingHolds'

const VERDICT: Record<TileKind, string> = { ok: 'met every gate', trouble: 'met its gates, with trouble on the way', bad: 'a gate was missed or overridden', wait: 'waiting', na: 'no gates asked' }

/**
 * One agent's Workflow tab: where its latest run stands now (the track, with the agent on its station), then its week as a tile for each run, by the day it began.
 * A tile opens that run in the Workflows window, and so does the link under them; the window is where a run's history is told.
 */
export function WorkflowTab({ agentName, agentId, folder, runs, spend, ctxFor, onOpenRun }: { agentName: string; agentId: string; folder: string | null; runs: Run[]; spend: Record<string, RunSpend>; ctxFor: (r: Run) => StepContext; /** Open the window on this run, or on its Runs when none is given. */ onOpenRun: (runId?: string) => void }) {
  const now = Date.now()
  // The run is shown as a flow of cards by default (with the buttons on them); the rail is the older, thinner picture of the same steps.
  const [view, setView] = useState<'flow' | 'rail'>('flow')
  const hold = useLandingHolds().find((h) => h.agentId === agentId)
  const mine = runs.filter((r) => r.agent === agentId)
  if (mine.length === 0)
    return (
      <div className="wf-tab">
        <div className="wf-notices"><RestartBanner folder={folder} /></div>
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
  const days = weekDays(week, ctxFor, now)
  const look = needsLook(days)
  const usd = week.reduce((n, r) => n + (spend[r.id]?.usd ?? 0), 0)
  const verdict = h.finished === 0 ? 'Nothing finished yet this week.' : h.metEvery === h.finished ? 'Every finished run met its gates.' : `${h.metEvery} of ${h.finished} finished runs met every gate.`
  return (
    <div className="wf-tab">
      <div className="wf-notices"><RestartBanner folder={folder} /></div>
      <div className="wt-cols">
        <div className="wt-left">
          <h5 className="wt-cap">Latest run · {latest.title}</h5>
          {latest.items && latest.items.length > 0 && (
            <ol className="wt-items" aria-label="Items of this run">
              {[{ title: latest.title }, ...latest.items].map((it, i) => (
                <li key={`${i}-${it.title}`}>
                  <span className="n">{i + 1}</span>
                  <span className="s">{it.title}</span>
                  {i > 0 && <span className="muted">added</span>}
                </li>
              ))}
            </ol>
          )}
          {latest.additions && latest.additions.length > 0 && (
            <div className="wt-added">
              <span className="muted">Added to the plan</span>
              <ul aria-label="Added to the plan">
                {latest.additions.map((a, i) => (
                  <li key={`${i}-${a.text}`}>{a.text}</li>
                ))}
              </ul>
            </div>
          )}
          {look.shown.length > 0 && (
            <div className="wt-look">
              <h5 className="wt-cap">Needs a look · {look.shown.length + look.more}</h5>
              <ul>
                {look.shown.map((r) => (
                  <li key={r.id}>
                    <button className={`wt-row ${r.kind}`} title={`${r.title}: ${VERDICT[r.kind]}`} onClick={() => onOpenRun(r.id)}>
                      <i aria-hidden="true" />
                      <b>{r.title}</b>
                      <em>{r.kind === 'wait' ? 'waiting' : 'missed a gate'} · {r.day}</em>
                    </button>
                  </li>
                ))}
              </ul>
              {look.more > 0 && <button className="su-link" onClick={() => onOpenRun()}>and {look.more} more in Workflows ↗</button>}
            </div>
          )}
          <p className="wt-line">
            {verdict} {formatCost(usd)}. <button className="su-link" onClick={() => onOpenRun()}>All of {agentName}'s runs in Workflows ↗</button>
          </p>
          <div className="wt-week">
            <h5 className="wt-cap">This week · {week.length} run{week.length === 1 ? '' : 's'}</h5>
            <div className="wt-strip" role="list" aria-label="This week">
              {days.map((d) => (
                <div key={d.label} role="listitem" aria-label={d.label} className={`wt-col ${d.today ? 'today' : ''}`}>
                  <span className="wt-pips">
                    {d.runs.map((r) => (
                      <button key={r.id} className={`wt-pip ${r.kind}`} aria-label={`${r.title}: ${VERDICT[r.kind]}`} title={`${r.title}: ${VERDICT[r.kind]}`} onClick={() => onOpenRun(r.id)} />
                    ))}
                  </span>
                  <small>{d.label}</small>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="wt-right">
            {latest.workflow && (
              <div className="wf-views" role="group" aria-label="How the run is shown">
                <span className="se-seg">
                  <button className={view === 'flow' ? 'on' : ''} aria-pressed={view === 'flow'} onClick={() => setView('flow')}>Flow</button>
                  <button className={view === 'rail' ? 'on' : ''} aria-pressed={view === 'rail'} onClick={() => setView('rail')}>Rail</button>
                </span>
                {view === 'flow' && landingPill(hold, landingKind(latest.workflow)) && <span className="pill land held">{landingPill(hold, landingKind(latest.workflow))!.text}</span>}
              </div>
            )}
            {latest.workflow && view === 'flow' ? <RunFlow run={latest} ctx={ctxFor(latest)} /> : track ? <RunTrack track={track} seed={agentId} agentName={agentName} landing={landingPill(hold, landingKind(latest.workflow))} /> : <p className="hint">Nothing is running for {agentName}. The last task was “{latest.title}”.</p>}
        </div>
      </div>
    </div>
  )
}
