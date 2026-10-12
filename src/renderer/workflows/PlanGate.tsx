import { useState } from 'react'
import { answersOf, unanswered } from '../../shared/plan'
import type { Round, Run } from '../../shared/runs'
import { checkText } from '../../shared/runStats'

type Decide = (state: 'approved' | 'changes' | 'released', o?: { note?: string; answers?: { question: string; answer: string }[] }) => void

/** The plan gate: what the agent says it understood, checked before it builds. The person answers the open questions, then approves or sends it back. */
export function PlanGate({ agentName, run, round, onDecide }: { agentName: string; run: Run; round: Round; onDecide: Decide }) {
  const plan = round.plan!
  const r = plan.readback
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [asking, setAsking] = useState(false)
  const [note, setNote] = useState('')
  const open = unanswered(r, answers)
  const given = answersOf(r, answers)
  const answer = (q: string, a: string) => setAnswers((x) => ({ ...x, [q]: a }))
  return (
    <section className="inline-need dialog plan-gate" aria-label={`Plan from ${agentName}`}>
      <header className="dialog-bar">
        <span className="pg-tag">Plan gate</span>
        <b>Check what {agentName} understood before the build starts</b>
      </header>
      <div className="pg-body">
        <p className="pg-task">{run.title}</p>
        <div className="pg-row"><span className="pg-k goal">Goal</span><span>{r.goal}</span></div>
        {r.assumptions.map((a, i) => (
          <div key={i} className="pg-row"><span className={`pg-k ${a.kind}`}>{a.kind === 'given' ? 'Given' : 'Guessed'}</span><span className={a.kind === 'given' ? 'dim' : ''}>{a.text}</span></div>
        ))}
        {r.outOfScope.length > 0 && <div className="pg-row"><span className="pg-k scope">Out of scope</span><span className="dim">{r.outOfScope.join(' ')}</span></div>}
        {r.questions.map((q) => (
          <div key={q.text} className="pg-row">
            <span className="pg-k open" title={q.source === 'check' ? 'Found by the intent check, comparing your request with the plan' : undefined}>{q.source === 'check' ? 'From check' : 'Open'}</span>
            <div className="pg-q">
              <span>{q.text}</span>
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
        {asking && (
          <label className="pg-note">
            What should change?
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
          </label>
        )}
        <div className="pg-acts">
          {!asking ? (
            <>
              <button className="primary" disabled={open.length > 0} onClick={() => onDecide('approved', { answers: given })}>Approve plan</button>
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
        <small className="pg-foot">{open.length > 0 ? `${open.length} open question${open.length === 1 ? '' : 's'} block approval · ` : ''}{plan.path || 'plan.md'}</small>
      </div>
    </section>
  )
}
