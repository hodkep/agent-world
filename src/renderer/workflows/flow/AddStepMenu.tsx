import { useEffect, useRef, useState } from 'react'
import { STEP_KINDS, type StepKind } from '../../../shared/workflow'
import { PixelIcon } from '../../chat/PixelIcon'
import { ACTOR, KIND_LABEL } from './stepFlow'

const DOES: Record<StepKind, string> = {
  plan: 'The agent plans first, and you can approve the plan',
  work: 'The agent does the work, with skills',
  check: 'A command the app runs; it can be made to pass',
  audit: 'A reviewer model reads the branch',
  approve: 'Stops until you decide',
  pr: 'The agent pushes the branch and opens a pull request',
  merge: 'You land it into the base branch'
}

/** The way to add a step: the kinds, each with what it does, in a menu under the button. */
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
      {open && (
        <div className="fl-add-menu" role="menu" aria-label="Add a step">
          {STEP_KINDS.map((k) => (
            <button key={k} role="menuitem" onClick={() => (setOpen(false), onAdd(k))}>
              <span className={`fl-who a-${ACTOR[k]}`}><PixelIcon name={ACTOR[k] === 'reviewer' ? 'review' : (ACTOR[k] as 'agent' | 'command' | 'you')} /></span>
              <span><b>{KIND_LABEL[k]}</b><small>{DOES[k]}</small></span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
