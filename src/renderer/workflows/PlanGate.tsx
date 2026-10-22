import { useState } from 'react'
import { answersOf, planCounts, unanswered } from '../../shared/plan'
import type { Round, Run } from '../../shared/runs'
import { checkText } from '../../shared/runStats'
import { Markdown } from '../chat/markdown'
import { OutlineIcon } from '../panel/IconButton'

// Which plans the person folded, kept while the app runs: a plan sent again (a new submission) opens expanded.
const folded = new Set<string>()

type Decide = (state: 'approved' | 'changes' | 'released', o?: { note?: string; answers?: { question: string; answer: string }[] }) => void

/** The plan gate: what the agent says it understood, checked before it builds. The person answers the open questions, then approves or sends it back. */
export function PlanGate({ agentName, run, round, onDecide }: { agentName: string; run: Run; round: Round; onDecide: Decide }) {
  const plan = round.plan!
  // What the agent wrote is read as in the chat: Markdown, an address a link, the path of a real file a link that opens it (a page in Preview).
  const md = (text: string) => <Markdown text={text} agentId={run.agent} />
  const r = plan.readback
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [asking, setAsking] = useState(false)
  const foldKey = `${run.id}:${plan.submittedAt}`
  const [fold, setFold] = useState(folded.has(foldKey))
  const setFolded = (v: boolean) => (v ? folded.add(foldKey) : folded.delete(foldKey), setFold(v))
  const [noting, setNoting] = useState(false)
  const [note, setNote] = useState('')
  const open = unanswered(r, answers)
  const given = answersOf(r, answers)
  const answer = (q: string, a: string) => setAnswers((x) => ({ ...x, [q]: a }))
  return (
    <section className="inline-need dialog plan-gate" aria-label={`Plan from ${agentName}`}>
      <header className="dialog-bar">
        <span className="pg-tag">Plan gate</span>
        <b>Check what {agentName} understood before the build starts</b>
        <button className="tip-btn pg-fold" aria-expanded={!fold} aria-label={fold ? 'Open the plan' : 'Collapse the plan'} data-tip={fold ? 'Open the plan' : 'Collapse the plan, keep the buttons'} onClick={() => setFolded(!fold)}>
          <OutlineIcon name="chevron" />
        </button>
      </header>
      {fold ? (
        <div className="pg-sum">
          <span className="pg-k goal">Goal</span>
          <div className="pg-sumtext">
            <div className="pg-text">{md(r.goal)}</div>
            <small>{planCounts(r, answers)}</small>
          </div>
          <div className="pg-acts">
            <button className="primary" disabled={open.length > 0} title={open.length > 0 ? 'Answer the open question first' : undefined} onClick={() => onDecide('approved', { ...(note.trim() && { note: note.trim() }), answers: given })}>Approve plan</button>
            <button onClick={() => (setAsking(true), setFolded(false))}>Request changes</button>
          </div>
        </div>
      ) : (
      <div className="pg-body">
        <p className="pg-task">{run.title}</p>
        <div className="pg-row"><span className="pg-k goal">Goal</span><div className="pg-text">{md(r.goal)}</div></div>
        {r.assumptions.map((a, i) => (
          <div key={i} className="pg-row"><span className={`pg-k ${a.kind}`}>{a.kind === 'given' ? 'Given' : 'Guessed'}</span><div className={`pg-text ${a.kind === 'given' ? 'dim' : ''}`}>{md(a.text)}</div></div>
        ))}
        {r.outOfScope.length > 0 && <div className="pg-row"><span className="pg-k scope">Out of scope</span><div className="pg-text dim">{md(r.outOfScope.join(' '))}</div></div>}
        {r.questions.map((q) => (
          <div key={q.text} className="pg-row">
            <span className="pg-k open" title={q.source === 'check' ? 'Found by the intent check, comparing your request with the plan' : undefined}>{q.source === 'check' ? 'From check' : 'Open'}</span>
            <div className="pg-q">
              <div className="pg-text">{md(q.text)}</div>
              {q.options.length > 0 ? (
                <div className="pg-opts" role="radiogroup" aria-label={q.text}>
                  {q.options.map((o) => (
                    <button key={o} role="radio" aria-checked={answers[q.text] === o} className={answers[q.text] === o ? 'on' : ''} onClick={() => answer(q.text, o)}>{o}</button>
                  ))}
                </div>
              ) : (
                <input aria-label={q.text} value={answers[q.text] ?? ''} onChange={(e) => answer(q.text, e.target.value)} placeholder="Your answer" />
              )}
            </div>
          </div>
        ))}
        {r.questions.length === 0 && (
          <div className="pg-row"><span className="pg-k open">Open</span><span className="pg-none">{agentName} asked no questions.</span></div>
        )}
        {(asking || noting) ? (
          <label className="pg-note">
            {asking ? 'What should change?' : `A note for ${agentName}`}
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder={asking ? undefined : `Anything ${agentName} should know before it builds`} />
          </label>
        ) : (
          <button className="su-link pg-add" onClick={() => setNoting(true)}>＋ Add a note for {agentName}</button>
        )}
        <div className="pg-acts">
          {!asking ? (
            <>
              <button className="primary" disabled={open.length > 0} onClick={() => onDecide('approved', { ...(note.trim() && { note: note.trim() }), answers: given })}>Approve plan</button>
              <button onClick={() => setAsking(true)}>Request changes</button>
            </>
          ) : (
            <>
              <button className="primary" disabled={!note.trim() && given.length === 0} onClick={() => onDecide('changes', { note: note.trim(), answers: given })}>Send back</button>
              <button onClick={() => setAsking(false)}>Cancel</button>
            </>
          )}
          <button className="pg-release" onClick={() => onDecide('released')} title="Let the agent edit without approving this plan">Let {agentName} edit without approval</button>
        </div>
        {checkText(plan.check) && <small className="pg-foot">{checkText(plan.check)}</small>}
        <small className="pg-foot pg-text">{open.length > 0 ? `${open.length} open question${open.length === 1 ? '' : 's'} block approval · ` : ''}{md(`\`${plan.path || 'plan.md'}\``)}</small>
      </div>
      )}
    </section>
  )
}
