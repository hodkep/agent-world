import { useCallback, useEffect, useRef, useState } from 'react'
import type { MergeCheck } from '../../shared/mergeCheck'
import { stepCardOf } from '../../shared/stepCard'

/**
 * The step that waits for the person, as the last thing in the conversation: it scrolls with the chat, takes room only inside it, and never opens by itself or sits above
 * the message box. Set aside lifts what holds the run and records the step as not followed; the quiet line it leaves has Undo.
 */
export function StepCard({ agentId, agentName, held, working }: { agentId: string; agentName: string; /** Git is holding this agent's merge, and the person has not put the hold away. */ held: boolean; /** The agent's turn is running: nothing waits for the person yet. */ working: boolean }) {
  const [merge, setMerge] = useState<MergeCheck | null>(null)
  const looking = useRef(false)
  const load = useCallback(async () => {
    if (looking.current) return
    looking.current = true
    try {
      setMerge((await window.aw.finishStatus(agentId, { readOnly: true })).merge ?? null)
    } catch {
      setMerge(null)
    } finally {
      looking.current = false
    }
  }, [agentId])
  useEffect(() => {
    void load()
    // The audit answers a while after it was asked for, and a commit made by hand in the terminal says nothing: so it is looked at again when the office says something changed and now and then.
    const off = [window.aw.onWorkflows(load), window.aw.onLanding(load)]
    const timer = setInterval(() => void load(), 5000)
    return () => (off.forEach((f) => f()), clearInterval(timer))
  }, [load, working, held])
  const spec = stepCardOf({ merge, held, working })
  if (!spec || !merge) return null
  const unseen = merge.audit.state === 'done' ? merge.audit.findings.flatMap((f, i) => (f.seen ? [] : [i])) : []
  const then = (f: () => Promise<unknown>) => () => void f().then(load, load)
  if (spec.kind === 'aside')
    return (
      <div className="step-card quiet" role="note" aria-label={`${agentName}'s audit, set aside`}>
        <span className="tag bad">{spec.tag}</span>
        <span className="sc-title">{spec.title}</span>
        <button className="ghost" onClick={then(() => window.aw.finishUndoAside(agentId))}>Undo</button>
      </div>
    )
  return (
    <section className={`step-card ${spec.kind}`} role="region" aria-label={spec.kind === 'hold' ? `${agentName}'s merge is held` : `${agentName}'s audit`}>
      <header>
        <span className="tag">{spec.tag}</span>
        <b className="sc-title">{spec.title}</b>
      </header>
      {spec.lines.length > 0 && (
        <ul>
          {spec.lines.map((l, i) => (
            <li key={`${i}-${l.text}`}>
              {l.text}
              {l.where && <small>{l.where}</small>}
            </li>
          ))}
          {spec.more > 0 && <li className="sc-more">and {spec.more} more</li>}
        </ul>
      )}
      <div className="sc-acts">
        {spec.actions.seenAll && <button className="primary" onClick={then(() => window.aw.finishSeen(agentId, unseen))}>All seen, fine</button>}
        {spec.actions.again && <button className="primary" onClick={then(() => window.aw.finishAudit(agentId))}>{spec.againLabel}</button>}
        {spec.actions.aside && (
          <button
            className="ghost"
            title={held ? `Lifts the hold: ${agentName}'s next merge goes through. The step is recorded as not followed.` : 'The step is recorded as not followed, and nothing it found holds the merge.'}
            onClick={then(async () => {
              if (held) await window.aw.landingAllow(agentId)
              await window.aw.finishAside(agentId)
            })}
          >
            Set aside
          </button>
        )}
      </div>
    </section>
  )
}
