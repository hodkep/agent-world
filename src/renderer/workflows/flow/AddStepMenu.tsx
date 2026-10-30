import { useEffect, useRef, useState } from 'react'
import type { StepKind } from '../../../shared/workflow'
import { PixelIcon } from '../../chat/PixelIcon'
import { ACTOR, KIND_LABEL } from './stepFlow'

const DOES: Record<StepKind, string> = {
  plan: 'The agent plans first, and you can approve the plan',
  work: 'The agent does the work, with skills: building, testing, reviewing, committing',
  check: 'A command the app runs; it can be made to pass',
  audit: 'A reviewer model reads the branch',
  approve: 'Stops until you decide',
  pr: 'The agent pushes the branch and opens a pull request',
  merge: 'You land it into the base branch'
}

/** The kinds a new step is picked from: a workflow only says what to do and where it asks you, so there is no check or audit for the app to run (the agent tests and reviews in a step of its own) and no step of an approval of its own (any step can ask you first). */
const OFFERED: StepKind[] = ['plan', 'work', 'pr', 'merge']

/** The kinds of step, each with what it does: the list a new step is picked from. */
export function KindMenu({ onPick, label = 'Add a step' }: { onPick: (kind: StepKind) => void; label?: string }) {
  return (
    <div className="fl-add-menu" role="menu" aria-label={label}>
      {OFFERED.map((k) => (
        <button key={k} role="menuitem" onClick={() => onPick(k)}>
          <span className={`fl-who a-${ACTOR[k]}`}><PixelIcon name={ACTOR[k] === 'reviewer' ? 'review' : (ACTOR[k] as 'agent' | 'command' | 'you')} /></span>
          <span><b>{KIND_LABEL[k]}</b><small>{DOES[k]}</small></span>
        </button>
      ))}
    </div>
  )
}

/** The way to add a step at the end: the kinds in a menu under the button. */
export function AddStepMenu({ onAdd }: { onAdd: (kind: StepKind) => void }) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), setOpen(false))
    window.addEventListener('mousedown', away)
    window.addEventListener('keydown', esc, true)
    return () => (window.removeEventListener('mousedown', away), window.removeEventListener('keydown', esc, true))
  }, [open])
  return (
    <div className="fl-add" ref={wrap}>
      <button aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <PixelIcon name="plus" scale={1} /> Add a step
      </button>
      {open && <KindMenu onPick={(k) => (setOpen(false), onAdd(k))} />}
    </div>
  )
}
