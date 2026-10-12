import type { Round, Run } from '../../shared/runs'
import { type RunSpend, auditText, formatDuration, landedText, spendText } from '../../shared/runStats'

const clock = (t: number) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

const PLAN_STATE = { submitted: 'waiting', approved: 'approved', changes: 'sent back', released: 'hold lifted' } as const

function RoundCard({ run, round, spend }: { run: Run; round: Round; spend: RunSpend | undefined }) {
  const now = Date.now()
  const mine = spend?.rounds[round.n - 1]
  return (
    <section className="wf-round" aria-label={`Round ${round.n}`}>
      <header>
        <b>Round {round.n}</b>
        <span className="muted">
          {round.endedAt === undefined ? 'open' : 'done'} · {round.commits.length} commit{round.commits.length === 1 ? '' : 's'}
          {!run.auto && <> · {formatDuration((round.endedAt ?? now) - round.startedAt)}</>}
        </span>
        <span className="wf-cost mono">{spendText(mine && spend ? { ...mine, known: spend.known } : undefined)}</span>
      </header>
      {round.plan && (
        <p className="wf-plan">
          <span className={`wf-tag ${round.plan.state === 'approved' || round.plan.state === 'released' ? '' : 'flag'}`}>Plan {PLAN_STATE[round.plan.state]}</span>
          {round.plan.readback.goal && <span>{round.plan.readback.goal}</span>}
          {round.plan.note && <span className="muted">Asked for: {round.plan.note}</span>}
        </p>
      )}
      {round.commits.length === 0 ? (
        <p className="hint">No commits in this round yet.</p>
      ) : (
        <ul>
          {round.commits.map((c) => (
            <li key={c.sha} className={c.flagged ? 'flagged' : ''}>
              <span className="mono sha">{c.sha.slice(0, 7)}</span>
              <span>{c.subject}</span>
              {c.flagged && <span className="wf-tag flag" title="Made with no task open, so it was attached to the nearest run.">no open task</span>}
              <span className="muted">{clock(c.t)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** One agent's runs, newest first, each round by round with its commits and what it cost. */
export function WorkflowTab({ agentName, agentId, runs, spend }: { agentName: string; agentId: string; runs: Run[]; spend: Record<string, RunSpend> }) {
  const mine = runs.filter((r) => r.agent === agentId).reverse()
  return (
    <div className="wf-tab">
      {mine.length === 0 ? (
        <div className="wf-empty">
          <b>No runs for {agentName} yet</b>
          <p>A run appears when {agentName} starts a task, or commits work it did not announce.</p>
        </div>
      ) : (
        mine.map((r) => (
          <article key={r.id} className="wf-run" aria-label={r.title}>
            <header>
              <b>{r.title}</b>
              <span className="wf-chip">{r.status}</span>
              {r.auto && <span className="wf-chip">from a commit</span>}
              <span className="wf-cost mono">{spendText(spend[r.id])}</span>
            </header>
            {r.summary && <p className="wf-summary">{r.summary}</p>}
            {r.auto && <p className="hint">{agentName} did not announce this task, so the app started the run from its commit. Its start time and cost are unknown.</p>}
            {[auditText(r), landedText(r)].map((line) => line && <p key={line} className="wf-gate">{line}</p>)}
            {[...r.rounds].reverse().map((round) => <RoundCard key={round.n} run={r} round={round} spend={spend[r.id]} />)}
          </article>
        ))
      )}
    </div>
  )
}
