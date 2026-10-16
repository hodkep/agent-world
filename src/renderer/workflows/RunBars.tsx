import { useState } from 'react'
import { type RunBar, columnRates, gateTiles, headline, runBar, timelineOf, weekSentences } from '../../shared/insights'
import type { Run } from '../../shared/runs'
import { type RunSpend, formatCost, formatDuration, runStats, spendText } from '../../shared/runStats'
import type { StepContext } from '../../shared/steps'
import { OutlineIcon } from '../panel/IconButton'

const SEG_WORD = { you: 'waiting on you', work: 'the agent working', check: 'checks', fail: 'a check that failed' } as const
const barLabel = (b: RunBar) => b.segments.map((s) => `${SEG_WORD[s.kind]} ${formatDuration(s.ms)}`).join(', ')
const day = (t: number) => new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' })

/** What each colour in the bars means; the same words are on the bar for anyone who cannot see them. */
export function BarLegend() {
  return (
    <div className="rb-legend" aria-hidden="true">
      <span><i className="rb-seg you" />waiting on you</span>
      <span><i className="rb-seg work" />agent working</span>
      <span><i className="rb-seg check" />checks</span>
      <span><i className="rb-seg fail" />a check failed</span>
      <span><i className="rb-seg review" />review</span>
      <span>flag: landed (green), landed anyway (red)</span>
      <span>each bar is one whole run; its time is on the right</span>
    </div>
  )
}

/** One run's time as a bar, drawn full width whatever it took (its length in time is the number beside it), so the colours say where it went and a short run is as readable as a long one; the marks say when the review ended and how it landed. */
function Bar({ bar }: { bar: RunBar }) {
  const total = Math.max(1, bar.totalMs)
  const landed = bar.marks.find((m) => m.kind === 'landed' || m.kind === 'anyway')
  return (
    <span className="rb-trk">
      <span className="rb-bar" role="img" aria-label={barLabel(bar)}>
        {bar.segments.map((s, i) => <i key={i} className={`rb-seg ${s.kind}`} style={{ flexGrow: s.ms }} />)}
        {bar.marks.filter((m) => m.kind !== 'landed' && m.kind !== 'anyway').map((m, i) => <i key={i} className={`rb-mark ${m.kind}`} style={{ left: `${(100 * m.at) / total}%` }} title={{ review: 'The review ended', lifted: 'You lifted the plan hold', round: 'A follow-up round began' }[m.kind as 'review' | 'lifted' | 'round']} />)}
      </span>
      {landed && (
        <span className={`rb-flag ${landed.kind}`} title={landed.kind === 'anyway' ? 'Landed anyway' : 'Landed'}>
          <OutlineIcon name="flag" size={12} />
        </span>
      )}
    </span>
  )
}

/** The Runs tab: the week in a few sentences, then a bar for each run that opens in place to say how it went, line by line. */
export function RunBars({ runs, spend, ctxFor, now, initial }: { runs: Run[]; spend: Record<string, RunSpend>; ctxFor: (r: Run) => StepContext; now: number; /** A run to show opened, when the window was opened on it. */ initial?: string }) {
  const [openId, setOpenId] = useState<string | null>(initial ?? null)
  const rows = [...runs].reverse().map((run) => ({ run, bar: runBar(run, now) }))
  const tiles = runs.map((r) => gateTiles(r, ctxFor(r)))
  const sentences = weekSentences(headline(runs, ctxFor, now), columnRates(tiles))
  const usd = runs.reduce((n, r) => n + (spend[r.id]?.usd ?? 0), 0)
  return (
    <div className="rb">
      <p className="rb-sum" aria-label="This week">
        {sentences.map((s, i) => <span key={i} className={`s-${s.tone}`}>{s.text} </span>)}
        <span className="s-plain">{formatCost(usd)} spent in {formatDuration(runStats(runs, now).ms)}.</span>
      </p>
      <BarLegend />
      <div className="rb-list" role="list" aria-label="Runs">
        {rows.map(({ run, bar }) => {
          const open = openId === run.id
          const rounds = run.rounds.length
          const commits = run.rounds.reduce((n, x) => n + x.commits.length, 0)
          const flagged = run.rounds.reduce((n, x) => n + x.commits.filter((c) => c.flagged).length, 0)
          const meta = [run.workflow ? run.workflow.name : 'from a commit', run.status === 'open' ? 'open' : day(run.startedAt), rounds > 1 ? `${rounds} rounds` : ''].filter(Boolean).join(' · ')
          return (
            <div key={run.id} role="listitem" className={`rb-item ${open ? 'is-open' : ''}`}>
              <button className="rb-row" aria-expanded={open} aria-label={`${run.name}: ${run.title}`} onClick={() => setOpenId(open ? null : run.id)}>
                <span className="rb-t"><b>{run.name} · {run.title}</b><small>{meta}</small></span>
                {bar ? <Bar bar={bar} /> : <span className="rb-none">started from a commit: no times were recorded</span>}
                <span className="rb-dur mono">{bar ? formatDuration(bar.totalMs) : '—'}</span>
              </button>
              {open && (
                <div className="rb-sheet" role="region" aria-label={`How ${run.title} went`}>
                  <p className="rb-facts">{rounds} round{rounds === 1 ? '' : 's'} · {commits} commit{commits === 1 ? '' : 's'}{flagged > 0 ? ` (${flagged} with no open task)` : ''} · {spendText(spend[run.id])}</p>
                  <ol className="rb-tl">
                    {timelineOf(run, now).map((e, i) => (
                      <li key={i} className={e.kind}>
                        <span className="at mono">{e.at === 0 ? 'start' : `+${formatDuration(e.at)}`}</span>
                        <i className="dot" aria-hidden="true" />
                        <span>{e.text}</span>
                      </li>
                    ))}
                  </ol>
                  {commits > 0 && (
                    <ul className="rb-commits" aria-label="Commits">
                      {run.rounds.flatMap((x) => x.commits).map((c) => (
                        <li key={c.sha}>
                          <span className="mono">{c.sha.slice(0, 7)}</span>
                          <span>{c.subject}</span>
                          {c.flagged && <span className="chipw">no open task</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
