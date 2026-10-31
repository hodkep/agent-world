import { useMemo, useState } from 'react'
import { Background, Controls, Handle, Position, ReactFlow, ReactFlowProvider, type Node, type NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { Run, RunStep } from '../../../shared/runs'
import { type StepContext, type StepState, laneStepIds, lanesOf, stepStates } from '../../../shared/steps'
import { stepName } from '../../../shared/workflow'
import { PixelIcon } from '../../chat/PixelIcon'
import { chainEdges, loopEdges } from './flowEdges'
import { ACTOR, ACTOR_WORD, chipsOf } from './stepFlow'
import { type RunAction, actionOf, skipOf, wordOf } from './runCard'
import { PITCH, layoutRun } from './runLayout'

/** The mark a step that is over carries in its corner: a tick for done, a cross for failed, a dash for not asked. */
const MARK: Partial<Record<StepState['state'], 'check' | 'x' | 'dash'>> = { passed: 'check', failed: 'x', skipped: 'dash' }

type Act = (step: RunStep, action: RunAction, how: 'go' | 'back', note?: string) => Promise<void>
type Skip = (step: RunStep, via: 'step' | 'check' | 'audit') => Promise<void>
type RunNodeData = { step: RunStep; state: StepState; index: number; act: Act; skip: Skip; /** What the card is about: the plan's goal, or the task or added work it is for. */ about?: string; /** For a card of work added to the run: its number, and the card's own (2.1, 2.2…). */ item?: number; label?: string; /** The last command that failed at this step, and how often. */ trouble?: { text: string; n: number } }
type RunFlowNode = Node<RunNodeData, 'run'>

/** One step of a run as a card: where it stands, what it is, and the button the person presses when it waits for them. */
function RunNode({ data }: NodeProps<RunFlowNode>) {
  const { step, state, index, act, skip, about, item, label, trouble } = data
  const actor = ACTOR[step.kind]
  const action = actionOf(state, step)
  // Skipping a step of added work is the agent's to report for it (with its item number); the Skip button is for the main chain.
  const via = item === undefined ? skipOf(state, step) : undefined
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
        {MARK[state.state] && <span className={`rn-mark ${state.state}`} aria-hidden="true"><PixelIcon name={MARK[state.state]!} scale={2} /></span>}
        {item !== undefined && <span className="rn-item" title={`Added to the run: item ${item}`}>item {item}</span>}
        <span className="fl-n" aria-hidden="true">{label ?? index + 1}</span>
      </div>
      {about && <p className="rn-about" title={about}>{about}</p>}
      {/* A step that is over (or not yet its turn) is shown by its border and a mark; the words stay for a reader of the screen, and are shown where the person is asked to act. */}
      <p className={`rn-state ${state.state} ${MARK[state.state] || state.state === 'pending' ? 'sr-only' : ''}`} role="status">{wordOf(state)}</p>
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
              {via && <button disabled={busy} title={step.optional ? 'It is optional: the run goes on without it.' : 'You can skip it: the run goes on without it.'} onClick={leave}>Skip</button>}
            </>
          )}
        </div>
      )}
      {trouble && <p className="rn-err" role="status">{trouble.n > 1 ? `Failed ${trouble.n} times: ` : 'Failed: '}{trouble.text}</p>}
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
  const lanes = useMemo(() => lanesOf(run, ctx), [run, ctxKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const lanesKey = JSON.stringify(lanes)
  const wfKey = JSON.stringify(wf)
  // What each card is about, for a run with work added to it: the main chain's own steps say it is for the task, and each added piece of work says what it is for.
  const goal = [...run.rounds].reverse().find((r) => r.plan)?.plan?.readback.goal
  const shared = lanes.length ? new Set(laneStepIds(wf)) : new Set<string>()
  const trouble = (id: string) => {
    const mine = (run.troubles ?? []).filter((t) => t.step === id)
    const last = mine.at(-1)
    return last ? { text: `${last.label}: ${(last.error.split('\n').find((l) => l.trim()) ?? last.command).slice(0, 90)}`, n: mine.length } : undefined
  }
  const troublesKey = JSON.stringify(run.troubles ?? [])
  const act: Act = async (step, action, how, note) => {
    const w = window.aw.workflows
    if (action.kind === 'run') return action.call === 'audit' ? window.aw.finishAudit(run.agent) : action.call === 'push' ? w.nudgePush(run.id) : action.call === 'again' ? w.askAgain(run.id, step.id) : action.call === 'start' ? w.startStep(run.id, step.id) : w.runCheck(run.id, step.id)
    if (action.plan) return w.decide(run.id, how === 'go' ? 'approved' : 'changes', note ? { note } : undefined)
    return w.approveStep(run.id, step.id, how === 'go' ? 'approved' : 'changes', note)
  }
  const skip: Skip = async (step, via) => {
    const w = window.aw.workflows
    if (via === 'audit') return window.aw.finishAside(run.agent)
    return via === 'check' ? w.skipCheck(run.id, step.id) : w.skipStep(run.id, step.id)
  }
  const laid = useMemo(() => layoutRun(states, lanes), [statesKey, lanesKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const nodes = useMemo<RunFlowNode[]>(
    () =>
      laid.nodes.map((n) => {
        const step = wf.steps.find((x) => x.id === n.stepId)!
        const lane = n.lane !== undefined ? lanes.find((l) => l.item === n.lane) : undefined
        const index = wf.steps.findIndex((x) => x.id === n.stepId)
        const about = lane ? `for: ${lane.title}` : step.kind === 'plan' && goal ? `for: ${goal}` : shared.has(step.id) && step.kind !== 'plan' ? `for: ${run.title}` : undefined
        const t = lane ? undefined : trouble(step.id)
        return { id: n.id, type: 'run', position: { x: n.x, y: n.y }, draggable: false, selectable: false, data: { step, state: n.state, index, act, skip, ...(about && { about }), ...(lane && { item: lane.item, label: `${lane.item}.${lane.steps.findIndex((x) => x.id === n.stepId) + 1}` }), ...(t && { trouble: t }) }, ariaLabel: lane ? `Item ${lane.item}, ${stepName(step)}, ${wordOf(n.state)}` : `Step ${index + 1}: ${stepName(step)}, ${wordOf(n.state)}` }
      }),
    // `act` is rebuilt with the run; the cards read the latest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [wfKey, statesKey, lanesKey, troublesKey, run.id, run.agent, run.title, goal]
  )
  const laneEdges = useMemo(
    () => laid.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: 'bottom', targetHandle: 'top', type: 'smoothstep', className: 'fl-lane-edge', style: { stroke: '#6ad0e0', strokeDasharray: '6 4', strokeWidth: 2 } })),
    [laid]
  )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const edges = useMemo(() => [...chainEdges(wf.steps.map((s) => s.id)), ...loopEdges(wf.steps), ...laneEdges], [wfKey, laneEdges])
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
  const lanes = lanesOf(run, ctx)
  const rows = layoutRun(stepStates(run, ctx), lanes).rows
  const height = Math.min(820, Math.max(320, rows * PITCH + 40))
  return (
    <div className="fl-wrap" style={{ height }}>
      <ReactFlowProvider>
        <Flow run={run} ctx={ctx} />
      </ReactFlowProvider>
    </div>
  )
}
