import { Fragment, useEffect, useState } from 'react'
import { type Invocations, type LedgerRow, type StageCount, type StageName, gateTiles, groupRuns, invocations, ledgerRow, ledgerTotals, runBar, runsWithin, stageCounts, timelineOf } from '../../shared/insights'
import type { Run } from '../../shared/runs'
import { type RunSpend, formatCost, formatDuration, spendText } from '../../shared/runStats'
import type { StepContext } from '../../shared/steps'
import { openTodo } from '../todos/todoStore'

const STAGES: { stage: StageName; label: string }[] = [{ stage: 'plan', label: 'Plan' }, { stage: 'check', label: 'Checks' }, { stage: 'review', label: 'Review' }, { stage: 'land', label: 'Landing' }]
const day = (t: number) => new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' })
const COLUMNS = 8
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** How often each workflow ran: a bar for each, and a small column for each day. */
function InvokedChart({ inv, days, now }: { inv: Invocations; days: number; now: number }) {
  const label = inv.byWorkflow.length === 0 ? 'Workflows invoked: none' : `Workflows invoked: ${inv.byWorkflow.map((w) => `${w.name} ${w.runs}`).join(', ')}`
  const top = Math.max(1, ...inv.byWorkflow.map((w) => w.runs))
  const peak = Math.max(1, ...inv.perDay)
  const dayName = (ago: number) => new Date(now - ago * 86_400_000).toLocaleDateString([], { weekday: 'short' })
  return (
    <div className="rb-chart">
      <p className="rb-cap"><span>Workflows invoked</span><em>{plural(inv.total, 'run')}{inv.fromCommit > 0 ? ` · ${inv.fromCommit} from a commit` : ''}</em></p>
      <div role="img" aria-label={label}>
        {inv.byWorkflow.map((w) => (
          <div key={w.name} className="rb-inv"><span>{w.name}</span><i className="rb-barline"><b style={{ width: `${(100 * w.runs) / top}%` }} /></i><span className="rb-n">{w.runs}</span></div>
        ))}
        <div className="rb-days" style={{ gridTemplateColumns: `repeat(${days}, 1fr)` }}>
          {inv.perDay.map((n, i) => <span key={i} title={`${plural(n, 'run')}, ${dayName(days - 1 - i)}`}><i style={{ height: `${(100 * n) / peak}%` }} /></span>)}
        </div>
        <div className="rb-dl">{days <= 7 ? inv.perDay.map((_, i) => <span key={i}>{dayName(days - 1 - i)}</span>) : <><span>{days} days ago</span><span>today</span></>}</div>
      </div>
    </div>
  )
}

const followed = (c: StageCount) => c.ok + c.trouble
const total = (c: StageCount) => c.ok + c.trouble + c.bad

/** For each stage, how often it was followed: a bar of first time, after trouble and not followed, with its count. */
function StagesChart({ counts }: { counts: Record<StageName, StageCount> }) {
  const label = `Stages followed: ${STAGES.map((s) => (total(counts[s.stage]) === 0 ? `${s.label} none yet` : `${s.label} ${followed(counts[s.stage])} of ${total(counts[s.stage])}`)).join(', ')}`
  return (
    <div className="rb-chart">
      <p className="rb-cap"><span>Stages followed</span><em>of the runs that reached each one</em></p>
      <div role="img" aria-label={label}>
        {STAGES.map(({ stage, label: name }) => {
          const c = counts[stage]
          const n = total(c)
          return (
            <div key={stage} className="rb-st">
              <span>{name}</span>
              <i className="rb-barline">
                <b className="ok" style={{ width: `${(100 * c.ok) / Math.max(1, n)}%` }} title={`${c.ok} first time`} />
                <b className="trouble" style={{ width: `${(100 * c.trouble) / Math.max(1, n)}%` }} title={`${c.trouble} after trouble`} />
                <b className="bad" style={{ width: `${(100 * c.bad) / Math.max(1, n)}%` }} title={`${c.bad} not followed`} />
              </i>
              <span className="rb-n">{n === 0 ? '—' : `${followed(c)} of ${n}`}</span>
            </div>
          )
        })}
      </div>
      <div className="rb-key" aria-hidden="true"><span><i className="ok" />first time</span><span><i className="trouble" />after trouble</span><span><i className="bad" />not followed</span></div>
    </div>
  )
}

/** What the checks column says for one run, and the tone it is said in. */
function checksCell(r: LedgerRow, open: boolean): { text: string; tone: string } {
  switch (r.checks.kind) {
    case 'first': return { text: 'first try', tone: '' }
    case 'retried': return { text: `passed on try ${r.checks.tries + 1}`, tone: 'warn' }
    case 'failed': return { text: 'did not pass', tone: 'bad' }
    case 'pending': return { text: 'waiting for you', tone: 'you' }
    default: return { text: open ? 'not reached' : '—', tone: 'dim' }
  }
}

function reviewCell(r: LedgerRow, anyway: boolean): { text: string; tone: string } {
  switch (r.review.kind) {
    case 'clean': return { text: 'clean', tone: '' }
    case 'seen': return { text: `${plural(r.review.n, 'finding')} seen`, tone: 'warn' }
    case 'unseen': return { text: `${plural(r.review.n, 'finding')} not seen${anyway ? ' · landed anyway' : ''}`, tone: 'bad' }
    default: return { text: '—', tone: 'dim' }
  }
}

/** The Runs tab: two charts (how often each workflow ran, how well each stage was followed), then a ledger of the runs grouped by what there is to do about them, each opening in place to say how it went. */
export function RunsLedger({ runs, spend, ctxFor, now, initial }: { runs: Run[]; spend: Record<string, RunSpend>; ctxFor: (r: Run) => StepContext; now: number; /** A run to show opened, when the window was opened on it. */ initial?: string }) {
  const [days, setDays] = useState<7 | 30>(7)
  const [openId, setOpenId] = useState<string | null>(initial ?? null)
  // The window was already open when another part of the app pointed at a run (a task's link): open that one.
  useEffect(() => {
    if (initial) setOpenId(initial)
  }, [initial])
  const shown = runsWithin(runs, days, now)
  const tiles = new Map(shown.map((r) => [r.id, gateTiles(r, ctxFor(r))]))
  const rows = new Map(shown.map((r) => [r.id, ledgerRow(r, tiles.get(r.id)!, runBar(r, now))]))
  const totals = ledgerTotals([...rows.values()])
  const usd = shown.reduce((n, r) => n + (spend[r.id]?.usd ?? 0), 0)
  const groups = groupRuns(shown, ctxFor)
  return (
    <div className="rb">
      <div className="mo-span" role="radiogroup" aria-label="How far back">
        {([7, 30] as const).map((d) => <button key={d} role="radio" aria-checked={days === d} className={days === d ? 'on' : ''} onClick={() => setDays(d)}>{d} days</button>)}
      </div>
      {shown.length === 0 ? (
        <p className="hint">No runs in the last {days} days.</p>
      ) : (
        <>
          <div className="rb-charts">
            <InvokedChart inv={invocations(shown, days, now)} days={days} now={now} />
            <StagesChart counts={stageCounts([...tiles.values()])} />
          </div>
          <table className="rb-tab" aria-label="Runs">
            <thead>
              <tr>
                <th aria-label="State" />
                <th>Run</th>
                <th className="r">Wall time<small>{totals.medianWallMs === null ? 'no finished run' : `median ${formatDuration(totals.medianWallMs)}`}</small></th>
                <th className="r">You waited<small>{formatDuration(totals.youMs)} in all</small></th>
                <th>Checks<small>{totals.checks.of === 0 ? 'none yet' : `${totals.checks.first} of ${totals.checks.of} first try`}</small></th>
                <th>Review<small>{totals.review.of === 0 ? 'none yet' : `${totals.review.found} of ${totals.review.of} found something`}</small></th>
                <th className="r">Commits</th>
                <th className="r">Cost<small>{formatCost(usd)}</small></th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <Fragment key={g.key}>
                  <tr className="rb-grp"><th colSpan={COLUMNS} scope="colgroup">{g.title}<em>{g.runs.length}{g.note ? ` · ${g.note}` : ''}</em></th></tr>
                  {g.runs.map((run) => {
                    const row = rows.get(run.id)!
                    const open = openId === run.id
                    const rounds = run.rounds.length
                    const commits = run.rounds.reduce((n, x) => n + x.commits.length, 0)
                    const flagged = run.rounds.reduce((n, x) => n + x.commits.filter((c) => c.flagged).length, 0)
                    const meta = [run.workflow ? run.workflow.name : 'from a commit', run.status === 'open' ? 'open' : day(run.startedAt), rounds > 1 ? `${rounds} rounds` : ''].filter(Boolean).join(' · ')
                    const checks = checksCell(row, run.status === 'open')
                    const review = reviewCell(row, run.landed?.how === 'anyway')
                    const share = row.wallMs ? row.youMs / row.wallMs : 0
                    return (
                      <Fragment key={run.id}>
                        <tr className={`rb-run ${g.key} ${open ? 'is-open' : ''}`} onClick={() => setOpenId(open ? null : run.id)}>
                          <td><i className={`rb-dot ${g.key}`} aria-hidden="true" /></td>
                          <td className="rb-t">
                            <button aria-expanded={open} aria-label={`${run.name}: ${run.title}`}><b>{run.name} · {run.title}</b><small>{meta}</small></button>
                            {run.todos?.map((id) => <button key={id} className="rb-todo" title={`Open todo#${id}`} onClick={(e) => (e.stopPropagation(), openTodo(id))}>todo#{id}</button>)}
                          </td>
                          <td className={`r num ${run.status === 'open' ? 'dim' : ''}`}>{row.wallMs === null ? '—' : formatDuration(row.wallMs)}</td>
                          <td className={`r num ${share >= 0.25 ? 'you' : ''}`}>{row.youMs === 0 ? '0' : formatDuration(row.youMs)}{share >= 0.25 && <span className="rb-share" aria-hidden="true"><i style={{ width: `${Math.round(100 * share)}%` }} /></span>}</td>
                          <td className={checks.tone}>{checks.text}</td>
                          <td className={review.tone}>{review.text}</td>
                          <td className="r num">{row.commits}</td>
                          <td className="r num">{spendText(spend[run.id])}</td>
                        </tr>
                        {open && (
                          <tr className="rb-sheetrow">
                            <td colSpan={COLUMNS}>
                              <div className="rb-sheet" role="region" aria-label={`How ${run.title} went`}>
                                <p className="rb-facts">{plural(rounds, 'round')} · {plural(commits, 'commit')}{flagged > 0 ? ` (${flagged} with no open task)` : ''} · {spendText(spend[run.id])}</p>
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
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
