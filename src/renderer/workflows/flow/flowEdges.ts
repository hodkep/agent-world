import { type Edge, MarkerType } from '@xyflow/react'
import type { Step } from '../../../shared/workflow'
import { loopsOf } from './stepFlow'

// Edge colours are painted into the arrow heads, so they are the theme's own values, not variables.
export const LINE = '#8a87a0'
export const BACK = '#b38bff'
export const RETRY = '#5f9e5f'

/** The arrows from each step to the next, bottom to top. */
export const chainEdges = (ids: string[]): Edge[] =>
  ids.slice(1).map((id, i) => ({ id: `c-${ids[i]}`, source: ids[i]!, sourceHandle: 'bottom', target: id, targetHandle: 'top', type: 'straight', markerEnd: { type: MarkerType.ArrowClosed, color: LINE }, style: { stroke: LINE, strokeWidth: 2 } }))

/** The dashed loops back up the flow: a check tried again, work sent back. */
export const loopEdges = (steps: Pick<Step, 'id' | 'kind' | 'gate'>[]): Edge[] =>
  loopsOf(steps as Step[]).map((l) => ({
    id: `l-${steps[l.from]!.id}`,
    source: steps[l.from]!.id,
    sourceHandle: 'loop-out',
    target: steps[l.to]!.id,
    targetHandle: 'loop-in',
    type: 'smoothstep',
    pathOptions: { offset: 36, borderRadius: 0 },
    label: l.kind === 'retry' ? 'retry' : 'send back',
    labelStyle: { fill: l.kind === 'retry' ? RETRY : BACK, fontSize: 10, fontFamily: 'Menlo, Consolas, monospace', textTransform: 'uppercase', letterSpacing: '0.08em' },
    labelBgStyle: { fill: '#0c0b12' },
    markerEnd: { type: MarkerType.ArrowClosed, color: l.kind === 'retry' ? RETRY : BACK },
    style: { stroke: l.kind === 'retry' ? RETRY : BACK, strokeWidth: 2, strokeDasharray: '5 4' }
  }))
