import { useCallback, useEffect, useRef, useState } from 'react'
import type { MergeCheck } from '../../shared/mergeCheck'
import { stepCardOf } from '../../shared/stepCard'

/**
 * The step that waits for the person, as the last thing in the conversation: it scrolls with the chat, takes room only inside it, and never opens by itself or sits above
 * the message box. Set aside lifts what holds the run and records the step as not followed; the quiet line it leaves has Undo.
 */
export function StepCard({ agentId, agentName, active, held, working }: { agentId: string; agentName: string; /** This agent's chat is the one on screen: only then is the branch looked at. */ active: boolean; /** Git is holding this agent's merge, and the person has not put the hold away. */ held: boolean; /** The agent's turn is running: nothing waits for the person yet. */ working: boolean }) {
  const [merge, setMerge] = useState<MergeCheck | null>(null)
  const [unrelated, setUnrelated] = useState<{ branch: string; base: string } | null>(null)
  const [open, setOpen] = useState<Set<number>>(new Set())
  const looking = useRef(false)
  const load = useCallback(async () => {
    if (looking.current) return
    looking.current = true
    try {
      const s = await window.aw.finishStatus(agentId, { readOnly: true })
      setMerge(s.merge ?? null)
      setUnrelated(s.unrelated ? { branch: s.branch, base: s.base } : null)
    } catch {
      setMerge(null)
      setUnrelated(null)
    } finally {
      looking.current = false
    }
  }, [agentId])
  useEffect(() => {
    if (!active) return
    void load()
    // The audit answers a while after it was asked for, and a commit made by hand in the terminal says nothing: so it is looked at again when the office says something changed and now and then.
    const off = [window.aw.onWorkflows(load), window.aw.onLanding(load)]
    const timer = setInterval(() => void load(), 5000)
    return () => (off.forEach((f) => f()), clearInterval(timer))
  }, [load, active, working, held])
  const spec = stepCardOf({ merge, held, working, unrelated })
  if (!spec) return null
  if (spec.kind === 'unrelated')
    return (
      <div className="step-card quiet" role="note" aria-label={`${agentName}'s branch has no shared history`}>
        <span className="tag bad">{spec.tag}</span>
        <span className="sc-title">{spec.title}</span>
      </div>
    )
  if (!merge) return null
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
    <section className={`step-card ${spec.kind}`} role="region" aria-label={spec.kind === 'hold' ? `${agentName}'s ${merge.land === 'pr' ? 'push' : 'merge'} is held` : `${agentName}'s audit`}>
      <header>
        <span className="tag">{spec.tag}</span>
        <b className="sc-title">{spec.title}</b>
      </header>
      {spec.lines.length > 0 && (
        <ul>
          {spec.lines.map((l, i) => (
            <li key={`${i}-${l.text}`} className={l.index !== undefined ? 'sc-line' : undefined}>
              <div className="sc-text">
                {l.text}
                {l.where && <small>{l.where}</small>}
                {l.index !== undefined && (l.files?.length ?? 0) > 1 && (
                  <>
                    <button className="ghost sc-show" aria-expanded={open.has(l.index)} onClick={() => setOpen((s) => (s.has(l.index!) ? new Set([...s].filter((x) => x !== l.index)) : new Set(s).add(l.index!)))}>
                      {open.has(l.index) ? 'hide files' : 'show files'}
                    </button>
                    {open.has(l.index) && <div className="sc-files">{l.files!.join(', ')}</div>}
                  </>
                )}
              </div>
              {l.index !== undefined && (
                <span className="sc-one">
                  {l.kind === 'out-of-scope' && <button title="It belongs in the plan: later audits will not report it, and it counts as seen." onClick={then(() => window.aw.finishAddToPlan(agentId, [l.index!]))}>Add to plan</button>}
                  <button onClick={then(() => window.aw.finishSeen(agentId, [l.index!]))}>Seen, fine</button>
                </span>
              )}
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
            title={held ? `Lifts the hold: ${agentName}'s next ${merge.land === 'pr' ? 'push' : 'merge'} goes through. The step is recorded as not followed.` : `The step is recorded as not followed, and nothing it found holds the ${merge.land === 'pr' ? 'push' : 'merge'}.`}
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
