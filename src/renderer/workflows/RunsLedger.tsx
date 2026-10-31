import { Fragment, useEffect, useRef, useState } from 'react'
import { type DayOutcome, type Invocations, type StepLine, dayOutcomes, gateTiles, groupRuns, invocations, ledgerRow, ledgerTotals, runBar, runsWithin, stepLines, stepSummary, timelineOf, todoChips } from '../../shared/insights'
import type { Run } from '../../shared/runs'
import { type RunSpend, formatCost, formatDuration, spendText } from '../../shared/runStats'
import type { StepContext } from '../../shared/steps'
import { openTodo } from '../todos/todoStore'
import { RunFlow } from './flow/RunFlow'

const day = (t: number) => new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' })
const COLUMNS = 7
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** How often each workflow ran: a bar for each, and a column for each day stacked by how its runs stand (clean, needs you, failed, skipped something). */
function InvokedChart({ inv, outcomes, days, now }: { inv: Invocations; outcomes: DayOutcome[]; days: number; now: number }) {
  const label = inv.byWorkflow.length === 0 ? 'Workflows invoked: none' : `Workflows invoked: ${inv.byWorkflow.map((w) => `${w.name} ${w.runs}`).join(', ')}`
  const top = Math.max(1, ...inv.byWorkflow.map((w) => w.runs))
  const peak = Math.max(1, ...outcomes.map((o) => o.ok + o.needs + o.failed + o.skipped))
  const dayName = (ago: number) => new Date(now - ago * 86_400_000).toLocaleDateString([], { weekday: 'short' })
  const seg = (n: number, cls: string) => n > 0 && <i className={cls} style={{ flex: n }} />
  return (
    <div className="rb-charts">
      <div className="rb-chart">
        <p className="rb-cap"><span>Workflows invoked</span><em>{plural(inv.total, 'run')}{inv.fromCommit > 0 ? ` · ${inv.fromCommit} from a commit` : ''}</em></p>
        <div role="img" aria-label={label}>
          {inv.byWorkflow.map((w) => (
            <div key={w.name} className="rb-inv" data-tip={`${w.name}: ${plural(w.runs, 'run')}`}><span>{w.name}</span><i className="rb-barline"><b style={{ width: `${(100 * w.runs) / top}%` }} /></i><span className="rb-n">{w.runs}</span></div>
          ))}
        </div>
      </div>
      <div className="rb-chart">
        <p className="rb-cap"><span>Runs per day</span><em>clean · needs you · failed · skipped something</em></p>
        <div className="rb-days" style={{ gridTemplateColumns: `repeat(${days}, 1fr)` }} role="img" aria-label="Runs per day">
          {outcomes.map((o, i) => {
            const n = o.ok + o.needs + o.failed + o.skipped
            return (
              <span key={i} className="rb-day" data-tip={`${dayName(days - 1 - i)}: ${plural(n, 'run')}${n ? `\n${o.ok} clean · ${o.needs} need you · ${o.failed} failed · ${o.skipped} skipped` : ''}`}>
                <i className="rb-col" style={{ height: `${(100 * n) / peak}%` }}>{seg(o.ok, 'ok')}{seg(o.needs, 'you')}{seg(o.failed, 'bad')}{seg(o.skipped, 'warn')}</i>
              </span>
            )
          })}
        </div>
        <div className="rb-dl">{days <= 7 ? outcomes.map((_, i) => <span key={i}>{dayName(days - 1 - i)}</span>) : <><span>{days} days ago</span><span>today</span></>}</div>
      </div>
    </div>
  )
}

/** One segment for each step of a run, coloured by how it stands; with `pick`, a segment filters the story to its step. */
function StepStrip({ lines, pick, onPick }: { lines: StepLine[]; pick?: string | null; onPick?: (name: string | null) => void }) {
  const WORD: Record<string, string> = { passed: 'met', skipped: 'skipped', failed: 'failed', waiting: 'waits for you', running: 'in progress', pending: 'not yet' }
  const cls = (st: string) => (st === 'running' ? 'waiting' : st)
  return (
    <span className="rb-pipe" role="group" aria-label="Steps of this run">
      {lines.map((l) => {
        const tip = `${l.name}: ${WORD[l.state]}${l.note ? ` (${l.note})` : ''}`
        return onPick ? (
          <button key={l.id} className={`${cls(l.state)} ${pick === l.name ? 'sel' : ''}`} data-tip={tip} aria-label={tip} aria-pressed={pick === l.name} onClick={() => onPick(pick === l.name ? null : l.name)} />
        ) : (
          <i key={l.id} className={cls(l.state)} data-tip={tip} />
        )
      })}
    </span>
  )
}

/** Ends a run that cannot go on: one confirmation, then what is left is set aside and the agent is told to stop. Only for a run that is still open. */
function EndRun({ run }: { run: Run }) {
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  if (run.status !== 'open') return null
  const end = () => {
    setBusy(true)
    setError('')
    window.aw.workflows.endRun(run.id).then(
      () => (setBusy(false), setAsking(false)),
      (e: Error) => (setBusy(false), setError(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')))
    )
  }
  return asking ? (
    <div className="rb-end" role="alertdialog" aria-label="End this run">
      <span>End this run? What is left is set aside and {run.name} is told to stop. This cannot be undone.</span>
      {error && <span className="error" role="alert">{error}</span>}
      <span className="rb-end-acts"><button className="danger" disabled={busy} onClick={end}>End run</button><button disabled={busy} onClick={() => setAsking(false)}>Keep it</button></span>
    </div>
  ) : (
    <button className="rb-end-btn" onClick={() => setAsking(true)}>End this run</button>
  )
}

/** The story of a run, in the order it happened: each step, the work added to it, the commits, and the commands that failed, a failure opening to what the command said. */
function RunStory({ run, now, only, step }: { run: Run; now: number; only: boolean; step: string | null }) {
  const all = timelineOf(run, now)
  const trouble = (e: { kind: string }) => e.kind === 'bad' || e.kind === 'trouble'
  const shown = all.filter((e) => (!only || trouble(e)) && (!step || e.step === step))
  return (
    <div className="rb-story">
      <ol className="rb-tl">
        {grouped(shown).map((e, i) => 'group' in e ? (
          <li key={i} className="grp">
            <span className="at mono">+{formatDuration(e.group[0]!.at)}</span>
            <i className="dot" aria-hidden="true" />
            <details className="rb-line rb-grpd">
              <summary><b>{e.group.length} commits</b><span className="muted"> · {e.group.filter((c) => c.sub).length > 0 ? 'some with no open task' : 'each tied to a task'}</span></summary>
              {e.group.map((c, j) => <div key={j} className="rb-gl">{c.text.replace(/^Commit /, '')}</div>)}
            </details>
          </li>
        ) : (
          <li key={i} className={e.kind}>
            <span className="at mono">{e.at === 0 ? 'start' : `+${formatDuration(e.at)}`}</span>
            <i className="dot" aria-hidden="true" />
            <span className="rb-line">
              <b>{e.text}</b>
              {e.step && !e.text.startsWith(e.step) && <span className="rb-stag">{e.step}</span>}
              {e.sub && <span className="muted"> · {e.sub}</span>}
              {e.fail && (
                <details className="rb-fail">
                  <summary><i className={`rb-chip ${e.fail.label}`}>{e.fail.label}</i><span>{e.fail.error.split('\n').find((l) => l.trim()) ?? 'it failed'}</span></summary>
                  <code>{e.fail.command}</code>
                  <pre>{e.fail.error}</pre>
                </details>
              )}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

type TL = ReturnType<typeof timelineOf>[number]
/** Three or more commits in a row become one row that opens, so a run with a dozen commits is not a dozen lines. */
function grouped(events: TL[]): Array<TL | { group: TL[] }> {
  const out: Array<TL | { group: TL[] }> = []
  let run: TL[] = []
  const flush = () => { if (run.length >= 3) out.push({ group: run }); else out.push(...run); run = [] }
  for (const e of events) { if (/^Commit [0-9a-f]{7}/.test(e.text)) run.push(e); else (flush(), out.push(e)) }
  flush()
  return out
}

/** One run in a panel beside the ledger: its numbers, the steps as a strip that picks what the story shows, the story with its commits folded, and the flow chart (always beside it when there is room, on a button when not). */
function RunSide({ run, spend, ctx, now, onClose }: { run: Run; spend: RunSpend | undefined; ctx: StepContext; now: number; onClose: () => void }) {
  const [only, setOnly] = useState(false)
  const [pick, setPick] = useState<string | null>(null)
  const [flow, setFlow] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  // Opening the flow brings it into view: it opens below the story, out of sight on a narrow panel.
  useEffect(() => {
    if (!flow) return
    const t = setTimeout(() => box.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60)
    return () => clearTimeout(t)
  }, [flow])
  const lines = stepLines(run, ctx)
  const rounds = run.rounds.length
  const commits = run.rounds.flatMap((x) => x.commits)
  const timeline = timelineOf(run, now)
  const trouble = timeline.filter((e) => e.kind === 'bad' || e.kind === 'trouble').length
  const waiting = lines.find((l) => l.state === 'waiting')
  const meta = [run.workflow ? run.workflow.name : 'from a commit', run.status === 'open' ? 'open' : day(run.startedAt), rounds > 1 ? `${rounds} rounds` : ''].filter(Boolean).join(' · ')
  return (
    <div className="rb-side" role="region" aria-label={`How ${run.title} went`}>
      <header>
        <span><b>{run.name} · {run.title}</b><small>{meta}{waiting ? ` · ` : ''}{waiting && <span className="rb-you">{waiting.name} waits for you</span>}</small></span>
        <button onClick={onClose} aria-label="Hide this run">Hide</button>
      </header>
      <div className="rb-stats">
        <span><b>{rounds}</b><small>{rounds === 1 ? 'round' : 'rounds'}</small></span>
        <span><b>{commits.length}</b><small>{commits.length === 1 ? 'commit' : 'commits'}</small></span>
        <span><b>{formatDuration((run.endedAt ?? now) - run.startedAt)}</b><small>wall</small></span>
        <span><b>{spendText(spend)}</b><small>cost</small></span>
      </div>
      {todoChips(run.todos).more > 0 && (
        <div className="rb-todos all" aria-label="Todos">
          {run.todos!.map((id) => <button key={id} className="rb-todo" title={`Open todo#${id}`} onClick={() => openTodo(id)}>todo#{id}</button>)}
        </div>
      )}
      <EndRun run={run} />
      {run.workflow && (
        <div className="rb-strip">
          <StepStrip lines={lines} pick={pick} onPick={setPick} />
          <span className="rb-strip-lb"><span>{lines[0]?.name}</span><span>{pick ? `Showing ${pick}` : 'Click a step to see only its events'}</span><span>{lines.at(-1)?.name}</span></span>
        </div>
      )}
      <div className="rb-flt">
        <button className={!only ? 'on' : ''} onClick={() => setOnly(false)}>All events</button>
        <button className={only ? 'on' : ''} disabled={trouble === 0} onClick={() => setOnly(true)}>Only trouble{trouble > 0 ? ` · ${trouble}` : ''}</button>
        {run.workflow && <button className="rb-flowbtn" aria-expanded={flow} onClick={() => setFlow(!flow)}>{flow ? 'Hide the flow' : 'Show the flow'}</button>}
      </div>
      <div className="rb-sbody">
        <div className="rb-sl"><RunStory run={run} now={now} only={only} step={pick} /></div>
        <div ref={box} className={`rb-sr ${flow ? 'open' : ''}`}>{run.workflow ? <RunFlow key={flow ? 'open' : 'shut'} run={run} ctx={ctx} /> : <p className="hint">This run followed no workflow: it was started from a commit.</p>}</div>
      </div>
      {commits.length > 0 && (
        <details className="rb-cmts">
          <summary>{plural(commits.length, 'commit')}{commits.some((c) => c.flagged) ? ` · ${commits.filter((c) => c.flagged).length} with no open task` : ''}</summary>
          <ul className="rb-commits" aria-label="Commits">
            {commits.map((c) => {
              const m = /^(\w+)(?:\(([^)]*)\))?!?:\s*(.*)$/s.exec(c.subject)
              return (
                <li key={c.sha}>
                  <span className="mono">{c.sha.slice(0, 7)}</span>
                  <span className="rb-cs">{m ? <><i className={`rb-ty k-${m[1]}`}>{m[1]}</i>{m[3]}</> : c.subject}{m?.[2] && <small>{m[2]}</small>}</span>
                  <span className={`rb-ck ${c.flagged ? '' : 'has'}`} title={c.flagged ? 'Made with no open task' : 'Made under an open task'}>{c.flagged ? '–' : '✓'}</span>
                </li>
              )
            })}
          </ul>
        </details>
      )}
    </div>
  )
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
  const needsYou = groups.find((g) => g.key === 'needs')?.runs.length ?? 0
  const side = openId ? runs.find((r) => r.id === openId) : undefined
  return (
    <div className={`rb ${side ? 'with-side' : ''}`}>
     <div className="rb-main">
      <div className="mo-span" role="radiogroup" aria-label="How far back">
        {([7, 30] as const).map((d) => <button key={d} role="radio" aria-checked={days === d} className={days === d ? 'on' : ''} onClick={() => setDays(d)}>{d} days</button>)}
      </div>
      {shown.length === 0 ? (
        <p className="hint">No runs in the last {days} days.</p>
      ) : (
        <>
          <div className="rb-tiles">
            <span className="rb-tile"><b>{shown.length}</b><small>{plural(shown.length, 'run').replace(/^\d+ /, '')} in {days} days</small></span>
            <span className={`rb-tile ${needsYou > 0 ? 'hot' : ''}`}><b>{shown.filter((r) => r.status === 'open').length}</b><small>still open</small>{needsYou > 0 && <em>{needsYou} wait for you</em>}</span>
            <span className="rb-tile ok"><b>{formatDuration(totals.youMs)}</b><small>you waited{totals.medianWallMs === null ? '' : `, median run ${formatDuration(totals.medianWallMs)}`}</small></span>
            <span className="rb-tile cost"><b>{formatCost(usd)}</b><small>{shown.length > 0 ? `${formatCost(usd / shown.length)} per run` : 'spent'}</small></span>
          </div>
          <InvokedChart inv={invocations(shown, days, now)} outcomes={dayOutcomes(shown, days, now, ctxFor)} days={days} now={now} />
          <table className="rb-tab" aria-label="Runs">
            <thead>
              <tr>
                <th aria-label="State" />
                <th>Run</th>
                <th className="r">Wall time<small>{totals.medianWallMs === null ? 'no finished run' : `median ${formatDuration(totals.medianWallMs)}`}</small></th>
                <th className="r">You waited<small>{formatDuration(totals.youMs)} in all</small></th>
                <th>Steps<small>met, skipped, failed</small></th>
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
                    const meta = [run.workflow ? run.workflow.name : 'from a commit', run.status === 'open' ? 'open' : day(run.startedAt), rounds > 1 ? `${rounds} rounds` : ''].filter(Boolean).join(' · ')
                    const steps = stepSummary(stepLines(run, ctxFor(run)))
                    const share = row.wallMs ? row.youMs / row.wallMs : 0
                    return (
                      <Fragment key={run.id}>
                        <tr className={`rb-run ${g.key} ${open ? 'is-open' : ''}`} onClick={() => setOpenId(open ? null : run.id)}>
                          <td><i className={`rb-dot ${g.key}`} aria-hidden="true" /></td>
                          <td className="rb-t">
                            <button aria-expanded={open} aria-label={`${run.name}: ${run.title}`}><b>{run.name} · {run.title}</b><small>{meta}</small></button>
                            {(() => {
                              const { shown, more } = todoChips(run.todos)
                              return shown.length > 0 && (
                                <div className="rb-todos">
                                  {shown.map((id) => <button key={id} className="rb-todo" title={`Open todo#${id}`} onClick={(e) => (e.stopPropagation(), openTodo(id))}>todo#{id}</button>)}
                                  {more > 0 && <button className="rb-todo more" title={`Show the other ${more} in the run`} onClick={(e) => (e.stopPropagation(), setOpenId(run.id))}>+{more} more</button>}
                                </div>
                              )
                            })()}
                          </td>
                          <td className={`r num ${run.status === 'open' ? 'dim' : ''}`}>{row.wallMs === null ? '—' : formatDuration(row.wallMs)}</td>
                          <td className={`r num ${share >= 0.25 ? 'you' : ''}`}>{row.youMs === 0 ? '0' : formatDuration(row.youMs)}{share >= 0.25 && <span className="rb-share" aria-hidden="true"><i style={{ width: `${Math.round(100 * share)}%` }} /></span>}</td>
                          <td className={steps.tone}>
                            <div className="rb-st">
                              {run.workflow && <StepStrip lines={stepLines(run, ctxFor(run))} />}
                              <span>{steps.text}</span>
                            </div>
                          </td>
                          <td className="r num">{row.commits}</td>
                          <td className="r num">{spendText(spend[run.id])}</td>
                        </tr>
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
     {side && <RunSide run={side} spend={spend[side.id]} ctx={ctxFor(side)} now={now} onClose={() => setOpenId(null)} />}
    </div>
  )
}
