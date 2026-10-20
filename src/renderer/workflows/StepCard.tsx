import { useCallback, useEffect, useRef, useState } from 'react'
import type { MergeCheck } from '../../shared/mergeCheck'
import { stepCardOf } from '../../shared/stepCard'
import { MoveBranch, type Moved } from './MoveBranch'

/**
 * The step that waits for the person, as the last thing in the conversation: it scrolls with the chat, takes room only inside it, and never opens by itself or sits above
 * the message box. Set aside lifts what holds the run and records the step as not followed; the quiet line it leaves has Undo.
 */
export function StepCard({ agentId, agentName, active, held, working }: { agentId: string; agentName: string; /** This agent's chat is the one on screen: only then is the branch looked at. */ active: boolean; /** Git is holding this agent's merge, and the person has not put the hold away. */ held: boolean; /** The agent's turn is running: nothing waits for the person yet. */ working: boolean }) {
  const [merge, setMerge] = useState<MergeCheck | null>(null)
  const [unrelated, setUnrelated] = useState<{ branch: string; base: string } | null>(null)
  const looking = useRef(false)
  // A branch just moved onto its base: the card says so (with Undo) until it is closed, though the branch is landable now.
  const [moved, setMoved] = useState<Moved | null>(null)
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
  if (moved)
    return (
      <section className="step-card moved" role="region" aria-label={`${agentName}'s branch was moved onto ${moved.base}`}>
        <header>
          <span className="tag ok">MOVED</span>
          <b className="sc-title">{moved.moved ? `Moved ${moved.moved} commit${moved.moved === 1 ? '' : 's'} onto ${moved.base}.` : `Started over from ${moved.base}.`}{moved.already ? ` ${moved.already} were already there.` : ''}</b>
        </header>
        <p className="mv">The branch now starts from {moved.base}, so it can be landed. The old branch is kept as <code>{moved.backup}</code> (delete it when you are sure).</p>
        {moved.error && <p className="mv bad" role="alert">{moved.error}</p>}
        <div className="sc-acts">
          <button className="ghost" onClick={() => void window.aw.finishMoveUndo(agentId, moved.backup, moved.head).then((r) => (r.ok ? (setMoved(null), void load()) : setMoved({ ...moved, error: r.message ?? 'It could not be put back.' })))}>Undo (put the old branch back)</button>
          <button className="ghost" onClick={() => setMoved(null)}>Close</button>
        </div>
      </section>
    )
  if (!spec) return null
  if (spec.kind === 'unrelated' && unrelated)
    return <MoveBranch agentId={agentId} agentName={agentName} branch={unrelated.branch} base={unrelated.base} title={spec.title} tag={spec.tag} onMoved={(m) => (setMoved(m), void load())} />
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
