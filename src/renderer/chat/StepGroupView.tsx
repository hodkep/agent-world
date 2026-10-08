import { useState } from 'react'
import { spanLabel } from './format'
import type { PictureSet } from './gallery'
import { groupSummary, type StepGroup } from './stepGroups'
import { ToolCard } from './ToolCard'

/** While a group works, this many of its newest steps show; the rest are a click away. */
const WINDOW = 3

/**
 * A run of commands and thoughts as one card: while the agent works it is open on its newest steps, and when the next message or group
 * comes it folds to a line saying what was done. Every step opens to the same command and output as a lone command does.
 */
export function StepGroupView({ group, active, onImage }: { group: StepGroup; active: boolean; onImage: (src: string, set?: PictureSet) => void }) {
  // null = as the group's state says: open while it works, folded once it is done.
  const [open, setOpen] = useState<boolean | null>(null)
  const [all, setAll] = useState(false)
  const { commands, failed, sec } = groupSummary(group.steps)
  const showing = open ?? active
  const thought = group.steps.reduce((n, s) => n + (s.kind === 'thinking' ? (s.took ?? 0) : 0), 0)
  const steps = active && !all ? group.steps.slice(-WINDOW) : group.steps
  const hidden = group.steps.length - steps.length
  const label = active ? `Working · ${group.steps.length} steps` : `Ran ${commands} ${commands === 1 ? 'command' : 'commands'}${thought ? ` · thought ${spanLabel(thought)}` : ''}`
  const meta = [failed ? `${failed} failed` : '', sec ? spanLabel(sec) : ''].filter(Boolean).join(' · ')
  return (
    <div className={`sg ${active ? 'is-active' : ''} ${showing ? 'is-open' : ''}`}>
      <button className="sg-head" aria-expanded={showing} onClick={() => setOpen(!showing)}>
        <span className="sg-caret" aria-hidden="true">{showing ? '▾' : '▸'}</span>
        <span className="sg-sum">{label}</span>
        <span className={`sg-meta ${failed ? 'is-bad' : ''}`}>{meta}</span>
      </button>
      {showing && (
        <div className="sg-steps">
          {hidden > 0 && (
            <button className="sg-earlier" onClick={() => setAll(true)}>
              {hidden} earlier {hidden === 1 ? 'step' : 'steps'}
            </button>
          )}
          {steps.map((s, i) =>
            s.kind === 'thinking' ? (
              <div key={s.id} className="sg-think">
                <span className="tc-dot" aria-hidden="true" /> {s.took ? `Thought for ${spanLabel(s.took)}` : 'Thought about it'}
              </div>
            ) : (
              <ToolCard key={s.id} run={s.run} working={active && i === steps.length - 1} onImage={onImage} />
            )
          )}
        </div>
      )}
      {active && <div className="sg-bar" aria-hidden="true"><b /></div>}
    </div>
  )
}
