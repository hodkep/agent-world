import { useEffect, useMemo, useState } from 'react'
import { Background, Controls, ReactFlow, ReactFlowProvider, applyNodeChanges, useReactFlow, type Edge, type NodeChange } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { SkillState } from '../../../shared/skills'
import { type Step, stepName } from '../../../shared/workflow'
import { StepNode, type StepFlowNode } from './StepNode'
import { chainEdges, loopEdges } from './flowEdges'
import { PITCH, dropIndex, positionOf } from './stepFlow'

const nodeTypes = { step: StepNode }
/**
 * The steps of a workflow as a flow, top to bottom: a card for each, the order drawn as arrows, and the loops back up (a check retried, work sent back) as dashed lines.
 * A card is picked with a click or the keyboard and dragged to a new place; nothing else about the flow is changed here, the fields are the inspector's.
 */
function Flow({ steps, selected, problems, skillStates, onSelect, onMove }: { steps: Step[]; selected: number | null; problems?: Set<number>; skillStates?: Record<string, SkillState>; onSelect: (i: number | null) => void; onMove: (from: number, to: number) => void }) {
  const base = useMemo<StepFlowNode[]>(
    () => steps.map((step, i) => ({ id: step.id, type: 'step', position: positionOf(i), data: { step, index: i, problem: problems?.has(i), skillStates }, selected: selected === i, ariaLabel: `Step ${i + 1}: ${stepName(step)}` })),
    [steps, selected, problems, skillStates]
  )
  // The nodes are the steps' own; while one is dragged it follows the pointer, and when let go the list decides where it sits.
  const [nodes, setNodes] = useState(base)
  useEffect(() => setNodes(base), [base])
  // A step added or taken out changes how much there is to see: the view fits it again.
  const flow = useReactFlow()
  useEffect(() => {
    const t = requestAnimationFrame(() => void flow.fitView({ padding: 0.18, maxZoom: 1, minZoom: 0.4 }))
    return () => cancelAnimationFrame(t)
  }, [steps.length, flow])
  const edges = useMemo<Edge[]>(() => [...chainEdges(steps.map((x) => x.id)), ...loopEdges(steps)], [steps])
  return (
    <ReactFlow
      className="fl"
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={(c: NodeChange<StepFlowNode>[]) => setNodes((ns) => applyNodeChanges(c, ns))}
      onNodeClick={(_, n) => onSelect(steps.findIndex((s) => s.id === n.id))}
      onPaneClick={() => onSelect(null)}
      onNodeDragStop={(_, n) => {
        const from = steps.findIndex((s) => s.id === n.id)
        const to = dropIndex(n.position.y, steps.length)
        if (to === from) setNodes(base)
        else onMove(from, to)
      }}
      nodesConnectable={false}
      deleteKeyCode={null}
      zoomOnDoubleClick={false}
      fitView
      fitViewOptions={{ padding: 0.18, maxZoom: 1, minZoom: 0.4 }}
      minZoom={0.3}
      maxZoom={1.5}
      colorMode="dark"
      aria-label="Steps of the workflow, as a flow"
    >
      <Background gap={18} size={1.4} color="#383250" />
      <Controls showInteractive={false} position="bottom-left" />
    </ReactFlow>
  )
}

/** The flow, with the height the steps need (a long workflow scrolls by panning, and the height stops growing). */
export function FlowCanvas(props: { steps: Step[]; selected: number | null; problems?: Set<number>; skillStates?: Record<string, SkillState>; onSelect: (i: number | null) => void; onMove: (from: number, to: number) => void }) {
  const height = Math.min(760, Math.max(300, props.steps.length * PITCH + 40))
  return (
    <div className="fl-wrap" style={{ height }}>
      <ReactFlowProvider>
        <Flow {...props} />
      </ReactFlowProvider>
    </div>
  )
}
