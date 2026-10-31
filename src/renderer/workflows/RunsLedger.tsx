import { Fragment, useEffect, useState } from 'react'
import { type Invocations, type MatrixCell, type StepCount, gateTiles, groupRuns, invocations, ledgerRow, ledgerTotals, runBar, runsWithin, stepCounts, stepLines, stepMatrix, stepSummary, timelineOf, todoChips } from '../../shared/insights'
import type { Run } from '../../shared/runs'
import { type RunSpend, formatCost, formatDuration, spendText } from '../../shared/runStats'
import type { StepContext } from '../../shared/steps'
import { openTodo } from '../todos/todoStore'
import { RunFlow } from './flow/RunFlow'

const STEP_WORD: Record<string, string> = { passed: 'met', skipped: 'skipped', failed: 'failed', waiting: 'waits for you', running: 'in progress', pending: 'not yet' }
const day = (t: number) => new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' })
const COLUMNS = 7
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

const CELL_WORD: Record<string, string> = { passed: 'met', skipped: 'skipped', failed: 'failed', open: 'not finished' }

/**
 * The steps down the side and the runs across, oldest to newest: each square is how one step ended in one run, so a skipped or failed step shows in the run it
 * happened in, and a step that is skipped over and over shows as a column of yellow. A square opens its run.
 */
function StepGrid({ shown, counts, ctxFor, open, onOpen }: { shown: Run[]; counts: StepCount[]; ctxFor: (r: Run) => StepContext; open: string | null; onOpen: (id: string) => void }) {
  const m = stepMatrix(shown, ctxFor)
  const by = new Map(counts.map((c) => [c.name, c]))
  const label = `Steps followed: ${m.steps.length === 0 ? 'none yet' : m.steps.map((n) => { const c = by.get(n); return c ? `${n} ${c.met} met, ${c.skipped} skipped, ${c.failed} failed` : n }).join('; ')}`
  const tip = (c: MatrixCell, step: string) => `${c.title}: ${step} ${c.state ? CELL_WORD[c.state] : 'not in this run'}${c.note ? ` (${c.note})` : ''}`
  return (
    <div className="rb-chart">
      <p className="rb-cap"><span>Steps followed</span><em>{m.runs.length === 1 ? '1 run' : `${m.runs.length} runs, oldest to newest`}{m.more > 0 ? ` · ${m.more} older not shown` : ''}</em></p>
      {m.steps.length === 0 ? (
        <p className="hint">No step reached yet.</p>
      ) : (
        <div className="rb-grid" role="group" aria-label={label}>
          {m.steps.map((name, row) => {
            const c = by.get(name)
            const trouble = (c?.skipped ?? 0) + (c?.failed ?? 0)
            return (
              <div key={name} className="rb-gr">
                <span className="rb-gn" title={name}>{name}</span>
                <span className="rb-gc">
                  {m.runs.map((r) => {
                    const cell = r.cells[row]!
                    return <button key={r.id} className={`rb-cell ${cell.state ?? 'none'} ${open === r.id ? 'on' : ''}`} title={tip(cell, name)} aria-label={tip(cell, name)} disabled={!cell.state} onClick={() => onOpen(r.id)} />
                  })}
                </span>
                <span className={`rb-gt ${c?.failed ? 'bad' : c?.skipped ? 'warn' : ''}`}>{c ? `${c.met}/${c.met + trouble}` : ''}{c?.failed ? ` · ${c.failed} failed` : c?.skipped ? ` · ${c.skipped} skipped` : ''}</span>
              </div>
            )
          })}
        </div>
      )}
      <div className="rb-key" aria-hidden="true"><span><i className="ok" />met</span><span><i className="trouble" />skipped</span><span><i className="bad" />failed</span><span><i className="open" />not finished</span></div>
    </div>
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
function RunStory({ run, now, only }: { run: Run; now: number; only: boolean }) {
  const all = timelineOf(run, now)
  const trouble = (e: { kind: string }) => e.kind === 'bad' || e.kind === 'trouble'
  const shown = only ? all.filter(trouble) : all
  return (
    <div className="rb-story">
      <p className="rb-count muted">{only ? `${shown.length} of ${all.length}` : all.length} events</p>
      <ol className="rb-tl">
        {shown.map((e, i) => (
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

const TABS = [{ id: 'story', label: 'Story' }, { id: 'steps', label: 'Steps' }, { id: 'added', label: 'Added' }, { id: 'trouble', label: 'Trouble' }] as const

/** One run in a panel beside the ledger: the same flow chart as the chat's Workflow tab, why steps were skipped or refused, the items added to it, how it went and its commits. */
function RunSide({ run, spend, ctx, now, onClose }: { run: Run; spend: RunSpend | undefined; ctx: StepContext; now: number; onClose: () => void }) {
  const [tab, setTab] = useState<'story' | 'steps' | 'added' | 'trouble'>('story')
  const lines = stepLines(run, ctx)
  const rounds = run.rounds.length
  const commits = run.rounds.flatMap((x) => x.commits)
  const flagged = commits.filter((c) => c.flagged).length
  const timeline = timelineOf(run, now)
  const added = run.items?.length ?? 0
  const trouble = timeline.filter((e) => e.kind === 'bad' || e.kind === 'trouble').length
  const meta = [run.workflow ? run.workflow.name : 'from a commit', run.status === 'open' ? 'open' : day(run.startedAt), rounds > 1 ? `${rounds} rounds` : ''].filter(Boolean).join(' · ')
  return (
    <div className="rb-side" role="region" aria-label={`How ${run.title} went`}>
      <header>
        <span><b>{run.name} · {run.title}</b><small>{meta}</small></span>
        <button onClick={onClose} aria-label="Hide this run">Hide</button>
      </header>
      <p className="rb-facts">{plural(rounds, 'round')} · {plural(commits.length, 'commit')}{flagged > 0 ? ` (${flagged} with no open task)` : ''} · {spendText(spend)}</p>
      {todoChips(run.todos).more > 0 && (
        <div className="rb-todos all" aria-label="Todos">
          {run.todos!.map((id) => <button key={id} className="rb-todo" title={`Open todo#${id}`} onClick={() => openTodo(id)}>todo#{id}</button>)}
        </div>
      )}
      <EndRun run={run} />
      <div className="rb-sbody">
        <div className="rb-sl">
          <div className="rb-tabs" role="tablist" aria-label="About this run">
            {TABS.map((t) => {
              const count = t.id === 'story' ? timeline.length : t.id === 'steps' ? lines.length : t.id === 'added' ? added : trouble
              if ((t.id === 'added' || t.id === 'trouble') && count === 0) return null
              return (
                <button key={t.id} role="tab" id={`rt-${run.id}-${t.id}`} aria-selected={tab === t.id} aria-controls={`rp-${run.id}-${t.id}`} className={`${tab === t.id ? 'on' : ''} ${t.id === 'trouble' ? 'bad' : ''}`} onClick={() => setTab(t.id)}>
                  {t.label}<i>{count}</i>
                </button>
              )
            })}
          </div>
          {(tab === 'story' || tab === 'trouble') && (
            <div role="tabpanel" id={`rp-${run.id}-${tab}`} aria-labelledby={`rt-${run.id}-${tab}`}>
              <RunStory run={run} now={now} only={tab === 'trouble'} />
            </div>
          )}
          <div role="tabpanel" id={`rp-${run.id}-steps`} aria-labelledby={`rt-${run.id}-steps`} hidden={tab !== 'steps'}>
            <ul className="rb-why" aria-label="Steps">
              {lines.map((l) => <li key={l.id} className={l.state}><b>{l.name}</b> {STEP_WORD[l.state]}{l.note ? `: ${l.note}` : ''}</li>)}
            </ul>
          </div>
          <div role="tabpanel" id={`rp-${run.id}-added`} aria-labelledby={`rt-${run.id}-added`} hidden={tab !== 'added'}>
            {added > 0 && (
              <ol className="rb-items" aria-label="Items added to this run">
                <li><span className="mono">1</span><span>{run.title}</span><em>the task as it began</em></li>
                {run.items!.map((it, i) => <li key={it.t}><span className="mono">{i + 2}</span><span>{it.title}</span><em>added +{formatDuration(it.t - run.startedAt)}</em></li>)}
              </ol>
            )}
          </div>
        </div>
        <div className="rb-sr">
          {run.workflow ? <RunFlow run={run} ctx={ctx} /> : <p className="hint">This run followed no workflow: it was started from a commit.</p>}
        </div>
      </div>
      {commits.length > 0 && (
        <ul className="rb-commits" aria-label="Commits">
          {commits.map((c) => (
            <li key={c.sha}>
              <span className="mono">{c.sha.slice(0, 7)}</span>
              <span>{c.subject}</span>
              {c.flagged && <span className="chipw">no open task</span>}
            </li>
          ))}
        </ul>
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
          <div className="rb-charts">
            <InvokedChart inv={invocations(shown, days, now)} days={days} now={now} />
            <StepGrid shown={shown} counts={stepCounts(shown, ctxFor)} ctxFor={ctxFor} open={openId} onOpen={(id) => setOpenId(id)} />
          </div>
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
                          <td className={steps.tone}>{steps.text}</td>
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
