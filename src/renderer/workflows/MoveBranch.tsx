import { useState } from 'react'

export interface Moved {
  moved: number
  already: number
  base: string
  backup: string
  head: string
  error?: string
}

type Plan = Awaited<ReturnType<typeof window.aw.finishMovePlan>>
type Stopped = { sha: string; subject: string; files: string[]; pick: string[] }
type Phase =
  | { k: 'idle' }
  | { k: 'loading' }
  | { k: 'plan'; plan: Plan; ticked: Set<string> }
  | { k: 'working' }
  | { k: 'stopped'; plan: Plan; info: Stopped }
  | { k: 'blocked'; text: string }
  | { k: 'error'; text: string }

/** The card for a branch that shares no history with its base: a button that moves it onto the base, after a look at what will move (a backup is kept). */
export function MoveBranch({ agentId, agentName, branch, base, title, tag, onMoved }: { agentId: string; agentName: string; branch: string; base: string; title: string; tag: string; onMoved: (m: Moved) => void }) {
  const [phase, setPhase] = useState<Phase>({ k: 'idle' })
  const head = (
    <>
      <span className="tag bad">{tag}</span>
      <b className="sc-title">{title}</b>
    </>
  )
  const look = async () => {
    setPhase({ k: 'loading' })
    try {
      const plan = await window.aw.finishMovePlan(agentId)
      if (plan.blocked?.kind === 'working') return setPhase({ k: 'blocked', text: `${agentName} is working. It can be moved when the turn ends.` })
      if (plan.blocked?.kind === 'uncommitted') return setPhase({ k: 'blocked', text: `${plan.blocked.count ?? 'Some'} file${plan.blocked.count === 1 ? ' is' : 's are'} not committed (the Code tab shows them). Commit them first so nothing is lost.` })
      setPhase({ k: 'plan', plan, ticked: new Set(plan.mine.map((c) => c.sha)) })
    } catch (e) {
      setPhase({ k: 'error', text: (e as Error).message })
    }
  }
  const run = async (plan: Plan, pick: string[]) => {
    setPhase({ k: 'working' })
    const r = await window.aw.finishMove(agentId, pick)
    if (r.ok) return onMoved({ moved: r.moved, already: plan.already, base: plan.base, backup: r.backup, head: r.head })
    if (r.kind === 'conflict' && r.sha) return setPhase({ k: 'stopped', plan, info: { sha: r.sha, subject: r.subject ?? '', files: r.files ?? [], pick } })
    setPhase(r.kind === 'working' || r.kind === 'uncommitted' ? { k: 'blocked', text: r.message } : { k: 'error', text: r.message })
  }

  if (phase.k === 'idle')
    return (
      <div className="step-card quiet" role="note" aria-label={`${agentName}'s branch has no shared history`}>
        {head}
        <button className="primary move-go" onClick={() => void look()}>Move onto {base}…</button>
      </div>
    )
  if (phase.k === 'loading')
    return (
      <div className="step-card quiet" role="note" aria-busy="true">
        {head}
        <span className="hint">Looking…</span>
      </div>
    )
  return (
    <section className="step-card unrelated-open" role="region" aria-label={`${agentName}'s branch has no shared history`}>
      <header>{head}</header>
      {phase.k === 'plan' && (
        <>
          <p className="mv">
            Compared with <b>{base}</b> by what each commit changes: <b>{phase.plan.already}</b> of this branch's commits are already in {base} (same changes, different history).{' '}
            {phase.plan.mine.length ? (
              <><b>{phase.plan.mine.length}</b> {phase.plan.mine.length === 1 ? 'is' : 'are'} not there. Those are the ones to move; untick any you do not want.</>
            ) : (
              <>None is missing from it: the branch can start over from {base}.</>
            )}{' '}
            A copy of the branch as it is now is kept as a backup branch.
          </p>
          {phase.plan.mine.length > 0 && (
            <ul className="mcs" aria-label="Commits to move">
              {phase.plan.mine.slice(0, 40).map((c) => (
                <li key={c.sha}>
                  <label>
                    <input type="checkbox" checked={phase.ticked.has(c.sha)} onChange={() => setPhase({ ...phase, ticked: new Set(phase.ticked.has(c.sha) ? [...phase.ticked].filter((x) => x !== c.sha) : [...phase.ticked, c.sha]) })} /> <code>{c.sha.slice(0, 7)}</code> {c.subject}
                  </label>
                </li>
              ))}
              {phase.plan.mine.length > 40 && <li className="sc-more">and {phase.plan.mine.length - 40} more (all are moved when ticked)</li>}
            </ul>
          )}
          <div className="sc-acts">
            {phase.plan.mine.length > 0 && (
              <button className="primary" disabled={phase.ticked.size === 0} onClick={() => void run(phase.plan, phase.plan.mine.map((c) => c.sha).filter((s) => phase.ticked.has(s)))}>
                Move {phase.ticked.size} commit{phase.ticked.size === 1 ? '' : 's'} onto {base}
              </button>
            )}
            <button className={phase.plan.mine.length ? '' : 'primary'} onClick={() => void run(phase.plan, [])}>{phase.plan.mine.length ? 'Start over from ' + base + ' (drop them)' : 'Start over from ' + base}</button>
            <button className="ghost" onClick={() => setPhase({ k: 'idle' })}>Cancel</button>
          </div>
        </>
      )}
      {phase.k === 'working' && <p className="mv"><span className="spin" /> Moving {branch} onto {base}… Your files are not touched until it is done; if anything goes wrong the branch is put back.</p>}
      {phase.k === 'stopped' && (
        <>
          <p className="mv">
            <span className="tag bad">STOPPED</span> Commit <code>{phase.info.sha.slice(0, 7)}</code> {phase.info.subject && <>({phase.info.subject}) </>}does not apply on {base}. It changes {phase.info.files.map((f) => <code key={f}>{f}</code>)}, which {base} has changed since. Nothing was moved: the branch is exactly as it was.
          </p>
          <div className="sc-acts">
            <button
              className="primary"
              onClick={() => void window.aw.chatSend(agentId, `Please move your branch onto ${base} yourself. It shares no history with ${base} (it was rewritten). The app moved your commits automatically but ${phase.info.sha.slice(0, 7)} (${phase.info.subject}) does not apply on ${base} (${phase.info.files.join(', ')}). Keep a backup branch first, start from ${base}, and re-apply your own work on top.`).then(() => setPhase({ k: 'idle' }))}
            >
              Ask {agentName} to move it
            </button>
            {phase.info.pick.length > 1 && <button onClick={() => void run(phase.plan, phase.info.pick.filter((s) => s !== phase.info.sha))}>Skip this commit and move the other {phase.info.pick.length - 1}</button>}
            <button className="ghost" onClick={() => setPhase({ k: 'idle' })}>Cancel</button>
          </div>
        </>
      )}
      {(phase.k === 'blocked' || phase.k === 'error') && (
        <>
          <p className="mv" role={phase.k === 'error' ? 'alert' : undefined}>Can not move it yet: {phase.text}</p>
          <div className="sc-acts"><button className="ghost" onClick={() => setPhase({ k: 'idle' })}>Back</button></div>
        </>
      )}
    </section>
  )
}
