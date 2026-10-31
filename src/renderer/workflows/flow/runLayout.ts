import type { Lane, StepState } from '../../../shared/steps'

/** A run's cards are taller than the builder's: they carry a state line and the buttons. */
export const PITCH = 168
/** How far to the right each column of added work sits. */
export const LANE_X = 320

export interface LaidNode {
  /** The step's id, or `lane<item>-<step id>` for a step of added work. */
  id: string
  stepId: string
  x: number
  y: number
  /** The number of the added work this card belongs to; none for the main chain. */
  lane?: number
  state: StepState
}

export interface LaidEdge {
  id: string
  source: string
  target: string
}

/**
 * Where each card of a run goes: the main chain in one column, and each piece of work added to the run as a column of its own to the right, starting at the row after the step
 * the run had reached. The edges are only the lane's: from that step to the lane's first card, card to card, and from its last card to the first step all the work shares.
 */
export function layoutRun(states: StepState[], lanes: Lane[]): { nodes: LaidNode[]; edges: LaidEdge[]; rows: number } {
  // A lane longer than the gap between its fork and its join pushes the steps from the join on down, so its last card joins the chain from above and never loops back up.
  let from = states.length
  let extra = 0
  for (const lane of lanes) {
    const forkAt = lane.fork ? states.findIndex((s) => s.id === lane.fork) : -1
    const joinAt = lane.join ? states.findIndex((s) => s.id === lane.join) : -1
    if (joinAt < 0) continue
    from = Math.min(from, joinAt)
    extra = Math.max(extra, (forkAt >= 0 ? forkAt + 1 : 0) + lane.steps.length - joinAt)
  }
  const nodes: LaidNode[] = states.map((s, i) => ({ id: s.id, stepId: s.id, x: 0, y: (i + (i >= from ? Math.max(0, extra) : 0)) * PITCH, state: s }))
  const edges: LaidEdge[] = []
  let rows = states.length + (from < states.length ? Math.max(0, extra) : 0)
  lanes.forEach((lane, k) => {
    const forkAt = lane.fork ? states.findIndex((s) => s.id === lane.fork) : -1
    const start = forkAt >= 0 ? forkAt + 1 : 0
    const ids = lane.steps.map((s) => `lane${lane.item}-${s.id}`)
    lane.steps.forEach((s, j) => nodes.push({ id: ids[j]!, stepId: s.id, x: LANE_X * (k + 1), y: (start + j) * PITCH, lane: lane.item, state: s }))
    rows = Math.max(rows, start + lane.steps.length)
    const link = (source: string, target: string) => edges.push({ id: `${source}>${target}`, source, target })
    if (lane.fork && forkAt >= 0 && ids[0]) link(lane.fork, ids[0])
    for (let j = 0; j + 1 < ids.length; j++) link(ids[j]!, ids[j + 1]!)
    if (lane.join && ids.length && states.some((s) => s.id === lane.join)) link(ids.at(-1)!, lane.join)
  })
  return { nodes, edges, rows }
}
