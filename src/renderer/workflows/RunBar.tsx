import { useEffect, useRef, useState } from 'react'
import type { Run } from '../../shared/runs'
import { type StepContext, stepStates } from '../../shared/steps'
import type { LandingPill, Track } from '../../shared/runTrack'
import { asksYouButNever } from '../../shared/workflow'
import { RunTrack } from './RunTrack'

const clean = (e: unknown) => (e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))

/**
 * The run bar above an agent's chat. A click on the step it stands on brings that step's card in the chat into view when there is one; when there
 * is none it opens a card under the bar: Run for a step that waits for it, the person's answer for one that waits on them, and, for the agent's
 * step still under way, Mark done, Skip and End run, so a run the agent stopped following can always be moved on by hand.
 */
export function RunBar({ run, ctx, track, seed, agentName, landing, onReopen }: { run: Run; ctx: StepContext; track: Track; seed: string; agentName: string; landing?: LandingPill | null; onReopen?: () => void }) {
  const [open, setOpen] = useState(false)
  const [ending, setEnding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const wrap = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), setOpen(false))
    window.addEventListener('keydown', esc, true)
    return () => window.removeEventListener('keydown', esc, true)
  }, [open])
  useEffect(() => (setOpen(false), setEnding(false), setError('')), [run.id])
  const states = stepStates(run, ctx)
  const on = states.find((s) => s.state !== 'passed' && s.state !== 'skipped')
  const def = on && run.workflow?.steps.find((s) => s.id === on.id)
  const act = (p: Promise<unknown>, close = true) => {
    setBusy(true)
    setError('')
    p.then(() => (setBusy(false), close && setOpen(false), setEnding(false)), (e) => (setBusy(false), setError(clean(e))))
  }
  // A step that already has its card in the chat is answered there: bring it into view and open it if it was folded. Says whether there was one.
  const showCard = (): boolean => {
    // Only this agent's chat: climb to the first box that holds a conversation, so a grid of chats never finds another agent's card.
    let at: HTMLElement | null = wrap.current
    while (at && !at.querySelector('[role="log"]')) at = at.parentElement
    const card = at ? [...at.querySelectorAll<HTMLElement>('.plan-gate')].at(-1) : undefined
    if (!card) return false
    card.querySelector<HTMLButtonElement>('button[aria-label="Open the card"]')?.click()
    card.scrollIntoView({ block: 'center' })
    return true
  }
  const toggle = () => {
    if (!open && showCard()) return
    setOpen((o) => !o)
  }
  const mine = def?.kind === 'work' && def.by !== 'person'
  const yours = on && on.state === 'waiting' && !on.toRun
  return (
    <div className="rbar" ref={wrap}>
      <RunTrack track={track} seed={seed} agentName={agentName} variant="bar" landing={landing} onReopen={onReopen} onNow={toggle} picked={open} />
      {open && on && def && (
        <section className="rbar-card" role="group" aria-label={`${on.name}: what you can do`}>
          <div className="rbar-h"><b>{on.name}</b><small>{on.toRun ? 'waits for you to press Run' : yours ? 'waits for your answer' : mine ? `${agentName}'s step` : 'the app runs it'}</small></div>
          {!ending && (
            <>
              <p>
                {on.toRun
                  ? `${agentName} does nothing on it until you press Run.`
                  : yours
                    ? `${agentName} has handed it to you.`
                    : mine
                      ? `${agentName} has not reported this step. If it is finished, close it yourself: ${agentName} is told and goes on to the next step.`
                      : 'The app is running it; it moves on by itself.'}
              </p>
              {mine && !on.toRun && !yours && asksYouButNever(def) && <p className="rbar-warn">Its brief asks for your approval, but the step never asks you: press Mark done when you are satisfied.</p>}
              <div className="rbar-acts">
                {on.toRun && <button className="primary" disabled={busy} onClick={() => act(window.aw.workflows.startStep(run.id, on.id))}>Run</button>}
                {yours && (
                  <>
                    <button className="primary" disabled={busy} onClick={() => act(window.aw.workflows.approveStep(run.id, on.id, 'approved'))}>{def.confirm ?? 'Approve'}</button>
                    <button disabled={busy} onClick={() => act(window.aw.workflows.approveStep(run.id, on.id, 'changes'))}>{def.reject ?? 'Send back'}</button>
                  </>
                )}
                {mine && !on.toRun && !yours && <button className="primary" disabled={busy} onClick={() => act(window.aw.workflows.closeStep(run.id, on.id))}>Mark done</button>}
                {mine && def.optional && !yours && <button disabled={busy} onClick={() => act(window.aw.workflows.skipStep(run.id, on.id))}>Skip</button>}
                <span className="rbar-sp" />
                <button className="ghost bad-text" disabled={busy} onClick={() => setEnding(true)}>End run…</button>
              </div>
            </>
          )}
          {ending && (
            <div className="rbar-end" role="alertdialog" aria-label="End this run">
              <span>End this run? What is left ({states.filter((s) => s.state !== 'passed' && s.state !== 'skipped').map((s) => s.name).join(', ')}) is set aside and {agentName} is told to stop. This cannot be undone.</span>
              <div className="rbar-acts"><button className="danger" disabled={busy} onClick={() => act(window.aw.workflows.endRun(run.id))}>End run</button><button disabled={busy} onClick={() => setEnding(false)}>Keep it</button></div>
            </div>
          )}
          {error && <p className="error" role="alert">{error}</p>}
        </section>
      )}
    </div>
  )
}
