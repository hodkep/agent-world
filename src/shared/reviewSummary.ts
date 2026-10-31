import type { ProposalView } from './builder'
import type { PreviewRow } from './workflowPreview'

export interface ReviewSummary {
  /** How many differences from the saved workflow; none for a new one, which is new as a whole. */
  changes: number
  /** How many steps stop for the person. */
  stops: number
  /** How many notes want a look: a stale draft, skills not enabled for the project, commands. */
  notes: number
  /** The steps of the draft that are new or changed, to be drawn so on the flow. A step taken out has no card to draw. */
  marks: Record<string, 'new' | 'changed'>
}

type Reviewed = Pick<ProposalView, 'diff' | 'stale' | 'skills' | 'commands'>

/** What the review drawer says in its heading, and what the flow draws on the steps. */
export function reviewSummary(view: Reviewed, rows: PreviewRow[]): ReviewSummary {
  const d = view.diff
  const showsChanges = !d.same && !d.isNew
  const marks: ReviewSummary['marks'] = {}
  if (showsChanges) {
    for (const a of d.added) marks[a.id] = 'new'
    for (const c of d.changed) marks[c.id] = 'changed'
  }
  const changes = showsChanges ? (d.name ? 1 : 0) + (d.when ? 1 : 0) + d.added.length + d.changed.length + d.removed.length + (d.reordered ? 1 : 0) : 0
  const granted = Object.values(view.skills).some((s) => s === 'granted')
  return { changes, stops: rows.filter((r) => r.stops).length, notes: (view.stale ? 1 : 0) + (granted ? 1 : 0) + (view.commands.length > 0 ? 1 : 0), marks }
}

/** The steps where the person is asked, with what happens there: the part of the preview that matters. */
export const askRows = (rows: PreviewRow[]) => rows.filter((r) => r.stops).map((r) => ({ id: r.id, label: r.label, says: r.says }))
