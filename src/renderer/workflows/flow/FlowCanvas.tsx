import { useEffect, useMemo, useState } from 'react'
import { Background, BaseEdge, Controls, EdgeLabelRenderer, type EdgeProps, Panel, ReactFlow, ReactFlowProvider, applyNodeChanges, getStraightPath, useReactFlow, type Edge, type NodeChange } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { SkillState } from '../../../shared/skills'
import { type Step, type StepKind, stepName } from '../../../shared/workflow'
import { AddStepMenu, KindMenu } from './AddStepMenu'
import { StepNode, type StepFlowNode } from './StepNode'
import { chainEdges, loopEdges } from './flowEdges'
import { PITCH, dropIndex, positionOf } from './stepFlow'

/** What the person can do on the canvas itself: move a step, add one between two, draw an arrow from one step to another, take one out. Without these it is only looked at. */
export interface FlowEdits {
  onMove: (from: number, to: number) => void
  /** A step of this kind where the + was pressed (`at` is the place it will have). */
  onInsert: (at: number, kind: StepKind) => void
  onAdd: (kind: StepKind) => void
  /** An arrow drawn from the bottom of one step to the top of another: the second goes right after the first. */
  onConnect: (after: string, id: string) => void
  /** Steps taken out with Delete or Backspace. */
  onDelete: (ids: string[]) => void
}

/** An arrow between two steps with a + on it, which adds a step there. */
function InsertEdge({ id, sourceX, sourceY, targetX, targetY, markerEnd, style, data }: EdgeProps) {
  const [path, x, y] = getStraightPath({ sourceX, sourceY, targetX, targetY })
  const [open, setOpen] = useState(false)
  const d = data as { at: number; insert: (at: number, kind: StepKind) => void }
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <div className="fl-ins nodrag nopan" style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)` }}>
          <button aria-label={`Add a step after step ${d.at}`} aria-haspopup="menu" aria-expanded={open} title="Add a step here" onClick={() => setOpen((o) => !o)}>+</button>
          {open && <KindMenu label={`Add a step after step ${d.at}`} onPick={(k) => (setOpen(false), d.insert(d.at, k))} />}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}

const nodeTypes = { step: StepNode }
const edgeTypes = { insert: InsertEdge }

/**
 * The steps of a workflow as a flow, top to bottom: a card for each, the order drawn as arrows, and the loops back up (a check retried, work sent back) as dashed lines.
 * A card is picked with a click or the keyboard, dragged to a new place or put after another by drawing an arrow to it; a + on an arrow adds a step there. The fields are the inspector's.
 */
function Flow({ steps, selected, problems, skillStates, switches, edits, onSelect }: { steps: Step[]; selected: number | null; problems?: Set<number>; skillStates?: Record<string, SkillState>; switches?: { planGate: boolean; mergeGate: boolean }; /** Left out, the flow is only looked at. */ edits?: FlowEdits; onSelect: (i: number | null) => void }) {
  const readOnly = !edits
  const base = useMemo<StepFlowNode[]>(
    () => steps.map((step, i) => ({ id: step.id, type: 'step', position: positionOf(i), data: { step, index: i, problem: problems?.has(i), skillStates, switches }, selected: selected === i, ariaLabel: `Step ${i + 1}: ${stepName(step)}` })),
    [steps, selected, problems, skillStates, switches]
  )
  // The nodes are the steps' own; while one is dragged it follows the pointer, and when let go the list decides where it sits.
  const [nodes, setNodes] = useState(base)
  useEffect(() => setNodes(base), [base])
  // A step added or taken out changes how much there is to see: the view fits it again.
  const flow = useReactFlow()
  useEffect(() => {
    const t = requestAnimationFrame(() => void flow.fitView({ padding: 0.12, maxZoom: 1, minZoom: 0.7 }))
    return () => cancelAnimationFrame(t)
  }, [steps.length, flow])
  const insert = edits?.onInsert
  const edges = useMemo<Edge[]>(() => [...chainEdges(steps.map((x) => x.id), insert), ...loopEdges(steps)], [steps, insert])
  return (
    <ReactFlow
      className={`fl ${readOnly ? '' : 'fl-edit'}`}
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={(c: NodeChange<StepFlowNode>[]) => setNodes((ns) => applyNodeChanges(c, ns))}
      onNodeClick={(_, n) => onSelect(steps.findIndex((s) => s.id === n.id))}
      onPaneClick={() => onSelect(null)}
      onNodeDragStop={(_, n) => {
        const from = steps.findIndex((s) => s.id === n.id)
        const to = dropIndex(n.position.y, steps.length)
        if (to === from) setNodes(base)
        else edits?.onMove(from, to)
      }}
      nodesDraggable={!readOnly}
      elementsSelectable={!readOnly}
      nodesConnectable={!readOnly}
      // An arrow runs from the bottom of one step to the top of another; anything else is not a connection.
      isValidConnection={(c) => c.sourceHandle === 'bottom' && c.targetHandle === 'top' && c.source !== c.target}
      onConnect={(c) => edits?.onConnect(c.source, c.target)}
      deleteKeyCode={readOnly ? null : ['Backspace', 'Delete']}
      onNodesDelete={(gone) => edits?.onDelete(gone.map((n) => n.id))}
      onEdgesDelete={() => {}}
      zoomOnDoubleClick={false}
      fitView
      fitViewOptions={{ padding: 0.12, maxZoom: 1, minZoom: 0.7 }}
      minZoom={0.3}
      maxZoom={1.5}
      colorMode="dark"
      aria-label="Steps of the workflow, as a flow"
    >
      <Background gap={18} size={1.4} color="#383250" />
      <Controls showInteractive={false} position="bottom-left" />
      {edits && (
        <Panel position="top-left" className="fl-tools">
          <AddStepMenu onAdd={edits.onAdd} />
        </Panel>
      )}
    </ReactFlow>
  )
}

/** The flow, with the height the steps need (a long workflow scrolls by panning, and the height stops growing). */
export function FlowCanvas(props: { steps: Step[]; selected: number | null; problems?: Set<number>; skillStates?: Record<string, SkillState>; switches?: { planGate: boolean; mergeGate: boolean }; /** Left out, the flow is only looked at: no card is dragged or picked. */ edits?: FlowEdits; onSelect: (i: number | null) => void }) {
  const height = Math.min(props.edits ? 880 : 600, Math.max(320, props.steps.length * PITCH + 60))
  return (
    <div className="fl-wrap" style={{ height }}>
      <ReactFlowProvider>
        <Flow {...props} />
      </ReactFlowProvider>
    </div>
  )
}
