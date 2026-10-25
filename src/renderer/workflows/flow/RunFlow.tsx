import { useMemo, useState } from 'react'
import { Background, Controls, Handle, Position, ReactFlow, ReactFlowProvider, type Node, type NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { Run, RunStep } from '../../../shared/runs'
import { type StepContext, type StepState, stepStates } from '../../../shared/steps'
import { stepName } from '../../../shared/workflow'
import { PixelIcon } from '../../chat/PixelIcon'
import { chainEdges, loopEdges } from './flowEdges'
import { ACTOR, ACTOR_WORD, chipsOf } from './stepFlow'
import { type RunAction, actionOf, skipOf, wordOf } from './runCard'

/** A run's cards are taller than the builder's: they carry a state line and the buttons. */
const RUN_PITCH = 168

type Act = (step: RunStep, action: RunAction, how: 'go' | 'back', note?: string) => Promise<void>
type Skip = (step: RunStep, via: 'step' | 'check' | 'audit') => Promise<void>
type RunNodeData = { step: RunStep; state: StepState; index: number; act: Act; skip: Skip }
type RunFlowNode = Node<RunNodeData, 'run'>

/** One step of a run as a card: where it stands, what it is, and the button the person presses when it waits for them. */
function RunNode({ data }: NodeProps<RunFlowNode>) {
  const { step, state, index, act, skip } = data
  const actor = ACTOR[step.kind]
  const action = actionOf(state, step)
  const via = skipOf(state, step)
  const [asking, setAsking] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const leave = () => {
    if (!via) return
    setBusy(true)
    setError('')
    skip(step, via).then(
      () => setBusy(false),
      (e: Error) => (setBusy(false), setError(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')))
    )
  }
  const press = (how: 'go' | 'back') => {
    if (!action) return
    setBusy(true)
    setError('')
    act(step, action, how, note.trim() || undefined).then(
      () => (setBusy(false), setAsking(false), setNote('')),
      (e: Error) => (setBusy(false), setError(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')))
    )
  }
  const text = step.kind === 'check' ? step.run : step.brief
  return (
    <div className={`fl-node rn ${state.state} a-${actor} ${state.toRun ? 'torun' : ''}`} data-state={state.state}>
      <Handle id="top" type="target" position={Position.Top} isConnectable={false} />
      <Handle id="bottom" type="source" position={Position.Bottom} isConnectable={false} />
      <Handle id="loop-out" type="source" position={Position.Right} isConnectable={false} />
      <Handle id="loop-in" type="target" position={Position.Right} isConnectable={false} />
      <div className="fl-head">
        <span className="fl-who" title={`Done by ${ACTOR_WORD[actor]}`}>
          <PixelIcon name={actor === 'reviewer' ? 'review' : (actor as 'agent' | 'command' | 'you')} />
        </span>
        <b className="fl-name">{stepName(step)}</b>
        <span className="fl-n" aria-hidden="true">{index + 1}</span>
      </div>
      <p className={`rn-state ${state.state}`} role="status">{wordOf(state)}</p>
      {text && <p className={`fl-text ${step.kind === 'check' ? 'mono' : ''}`}>{text}</p>}
      <div className="fl-chips">
        {chipsOf(step).map((c) => <span key={c.text} className={`fl-chip ${c.tone}`}>{c.text}</span>)}
      </div>
      {(action || via) && (
        <div className="rn-acts nodrag nopan">
          {asking && action ? (
            <>
              <textarea aria-label={`What should change in ${stepName(step)}?`} rows={2} value={note} placeholder="What should change?" onChange={(e) => setNote(e.target.value)} />
              <button className="primary" disabled={busy || !note.trim()} onClick={() => press('back')}>Send back</button>
              <button disabled={busy} onClick={() => setAsking(false)}>Cancel</button>
            </>
          ) : (
            <>
              {action && <button className="primary" disabled={busy} onClick={() => press('go')}>{action.label}</button>}
              {action?.kind === 'approve' && <button disabled={busy} onClick={() => setAsking(true)}>Send back</button>}
              {via && <button disabled={busy} title="It is optional: the run goes on without it." onClick={leave}>Skip</button>}
            </>
          )}
        </div>
      )}
      {error && <p className="error rn-error" role="alert">{error}</p>}
    </div>
  )
}

const nodeTypes = { run: RunNode }

function Flow({ run, ctx }: { run: Run; ctx: StepContext }) {
  const wf = run.workflow!
  // The cards are only drawn again when what they say changed: the run and its context are new objects on every refresh, and drawing them again would move the cards under the pointer.
  const ctxKey = JSON.stringify(ctx)
  const states = useMemo(() => stepStates(run, ctx), [run, ctxKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const statesKey = JSON.stringify(states)
  const wfKey = JSON.stringify(wf)
  const act: Act = async (step, action, how, note) => {
    const w = window.aw.workflows
    if (action.kind === 'run') return action.call === 'audit' ? window.aw.finishAudit(run.agent) : w.runCheck(run.id, step.id)
    if (action.plan) return w.decide(run.id, how === 'go' ? 'approved' : 'changes', note ? { note } : undefined)
    return w.approveStep(run.id, step.id, how === 'go' ? 'approved' : 'changes', note)
  }
  const skip: Skip = async (step, via) => {
    const w = window.aw.workflows
    if (via === 'audit') return window.aw.finishAside(run.agent)
    return via === 'check' ? w.skipCheck(run.id, step.id) : w.skipStep(run.id, step.id)
  }
  const nodes = useMemo<RunFlowNode[]>(
    () => wf.steps.map((step, i) => ({ id: step.id, type: 'run', position: { x: 0, y: i * RUN_PITCH }, draggable: false, selectable: false, data: { step, state: states[i]!, index: i, act, skip }, ariaLabel: `Step ${i + 1}: ${stepName(step)}, ${wordOf(states[i]!)}` })),
    // `act` is rebuilt with the run; the cards read the latest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [wfKey, statesKey, run.id, run.agent]
  )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const edges = useMemo(() => [...chainEdges(wf.steps.map((s) => s.id)), ...loopEdges(wf.steps)], [wfKey])
  return (
    <ReactFlow className="fl fl-run" nodes={nodes} edges={edges} nodeTypes={nodeTypes} nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} deleteKeyCode={null} zoomOnDoubleClick={false} fitView fitViewOptions={{ padding: 0.12, maxZoom: 1, minZoom: 0.4 }} minZoom={0.3} maxZoom={1.5} colorMode="dark" aria-label="Steps of the run, as a flow">
      <Background gap={18} size={1.4} color="#383250" />
      <Controls showInteractive={false} position="bottom-left" />
    </ReactFlow>
  )
}

/** A run's steps as the same flow the builder draws, read-only, with where each stands, and the Run and Approve buttons on the cards that wait for the person. */
export function RunFlow({ run, ctx }: { run: Run; ctx: StepContext }) {
  if (!run.workflow) return null
  const height = Math.min(820, Math.max(320, run.workflow.steps.length * RUN_PITCH + 40))
  return (
    <div className="fl-wrap" style={{ height }}>
      <ReactFlowProvider>
        <Flow run={run} ctx={ctx} />
      </ReactFlowProvider>
    </div>
  )
}
