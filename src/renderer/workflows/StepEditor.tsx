import { useEffect, useRef, useState } from 'react'
import { addStep, duplicateStep, insertStepAt, moveAfter, moveStep, moveStepTo, removeStep } from '../../shared/stepEdit'
import type { SkillState } from '../../shared/skills'
import { PixelIcon } from '../chat/PixelIcon'
import type { AddableItem } from '../panel/addItemGroups'
import { AddStepMenu } from './flow/AddStepMenu'
import { FlowCanvas } from './flow/FlowCanvas'
import { StepInspector } from './flow/StepInspector'
import { STEPS_MAX, type Workflow } from '../../shared/workflow'

const clean = (e: Error) => e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
/** Under this width the flow gives way to a plain list of the same steps: dragging on a narrow panel fights scrolling. */
const FLOW_MIN = 520
/** From this width the fields of a picked step sit beside the flow instead of under it. */
const SIDE_MIN = 700

/**
 * The builder's draft as a flow of steps the person can change in place: click a card to change its name, brief, command, gate and skills, drag it to move it, add or remove steps.
 * In a narrow panel the same steps are a plain list. Every change goes to the office, which checks it like a file; what it says is wrong shows under the steps, and saving waits until nothing is.
 */
export function StepEditor({ agentId, folder, workflow, skillStates, switches, at, edited, onProblem, onChanged }: { agentId: string; folder: string | null; workflow: Workflow; /** How each skill a step names stands in this project. */ skillStates: Record<string, SkillState>; /** The Settings switches a step with no gate of its own follows. */ switches?: { planGate: boolean; mergeGate: boolean }; /** When the draft last changed, as the office has it: a newer one from the builder replaces what is shown. */ at: number; edited?: number; onProblem: (problem: boolean) => void; onChanged: () => void }) {
  const [wf, setWf] = useState(workflow)
  const [problem, setProblem] = useState('')
  const [skills, setSkills] = useState<AddableItem[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const dirty = useRef(false)
  useEffect(() => {
    // The builder proposed again (or the edit was undone): show that, unless the person is in the middle of typing.
    if (!dirty.current) setWf(workflow)
  }, [workflow, at])
  useEffect(() => {
    void window.aw.library.list().then((l) => setSkills(l.items.filter((i) => i.kind === 'skill').sort((a, b) => a.id.localeCompare(b.id))), () => undefined)
  }, [])
  useEffect(() => () => clearTimeout(timer.current), [])
  const change = (next: Workflow) => {
    setWf(next)
    dirty.current = true
    onProblem(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      window.aw.workflows.editProposal(agentId, folder, next).then(
        () => ((dirty.current = false), setProblem(''), onProblem(false), onChanged()),
        (e: Error) => (setProblem(clean(e)), onProblem(true))
      )
    }, 350)
  }
  const undo = () => {
    clearTimeout(timer.current)
    dirty.current = false
    setProblem('')
    void window.aw.workflows.undoProposalEdits(agentId, folder).then((v) => (setWf(v.workflow), onProblem(false), onChanged()), () => undefined)
  }
  // The flow needs room; a narrow panel gets the list.
  const root = useRef<HTMLDivElement>(null)
  const [wide, setWide] = useState(true)
  const [side, setSide] = useState(false)
  useEffect(() => {
    const el = root.current
    if (!el) return
    const look = () => (setWide(el.clientWidth === 0 || el.clientWidth >= FLOW_MIN), setSide(el.clientWidth >= SIDE_MIN))
    look()
    const watch = new ResizeObserver(look)
    watch.observe(el)
    return () => watch.disconnect()
  }, [])
  const [picked, setPicked] = useState<number | null>(null)
  const cur = picked !== null && picked < wf.steps.length ? picked : null
  // Picking a step brings its fields into view: they sit under the flow, which can fill the panel.
  const fields = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (cur !== null && !side) fields.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  }, [cur, side])
  const drop = (from: number, to: number) => {
    change(moveStepTo(wf, from, to))
    setPicked(to)
  }
  return (
    <div className="se" aria-label="Edit the steps" ref={root}>
      {edited ? (
        <div className="se-head">
          <span className="muted">You edited {edited === 1 ? '1 thing' : `${edited} things`}.</span>
          <button className="su-link" onClick={undo}>Undo edits</button>
        </div>
      ) : null}
      {wide ? (
        <div className={side ? 'se-split' : undefined}>
          <FlowCanvas
            steps={wf.steps}
            selected={cur}
            skillStates={skillStates}
            switches={switches}
            onSelect={setPicked}
            edits={{
              onMove: drop,
              onAdd: (k) => {
                const next = addStep(wf, k)
                change(next)
                setPicked(next.steps.findIndex((x) => !wf.steps.some((o) => o.id === x.id)))
              },
              onInsert: (place, k) => {
                change(insertStepAt(wf, place, k))
                setPicked(Math.min(place, wf.steps.length))
              },
              onConnect: (after, id) => {
                const next = moveAfter(wf, after, id)
                if (next === wf) return
                change(next)
                setPicked(next.steps.findIndex((x) => x.id === id))
              },
              onDelete: (ids) => {
                change(ids.reduce((w, id) => removeStep(w, w.steps.findIndex((x) => x.id === id)), wf))
                setPicked(null)
              }
            }}
          />
          {cur === null ? (
            <p className="se-hint muted">Click a step to change it. Drag it to move it, or draw an arrow from the dot under one step to the dot over another to put it right after. + on an arrow adds a step there. Delete takes the picked step out.</p>
          ) : (
            <div className="se-pick" ref={fields}>
              <StepInspector wf={wf} at={cur} skills={skills} skillStates={skillStates} switches={switches} change={change} />
              <div className="se-acts">
                <button aria-label={`Move step ${cur + 1} up`} disabled={cur === 0} onClick={() => (change(moveStep(wf, cur, -1)), setPicked(cur - 1))}>Move up</button>
                <button aria-label={`Move step ${cur + 1} down`} disabled={cur === wf.steps.length - 1} onClick={() => (change(moveStep(wf, cur, 1)), setPicked(cur + 1))}>Move down</button>
                <button aria-label={`Duplicate step ${cur + 1}`} disabled={wf.steps.length >= STEPS_MAX} onClick={() => (change(duplicateStep(wf, cur)), setPicked(cur + 1))}>Duplicate</button>
                <button className="danger" aria-label={`Remove step ${cur + 1}`} disabled={wf.steps.length <= 1} onClick={() => (change(removeStep(wf, cur)), setPicked(null))}>Remove</button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <ol className="se-steps" aria-label="Steps">
          {wf.steps.map((s, i) => (
            <li key={`${s.id}-${i}`} className={`se-step k-${s.kind}`}>
              <StepInspector wf={wf} at={i} skills={skills} skillStates={skillStates} switches={switches} change={change} />
              <div className="se-acts">
                <button className="se-ico up" aria-label={`Move step ${i + 1} up`} disabled={i === 0} onClick={() => change(moveStep(wf, i, -1))}><PixelIcon name="chevron" scale={2} /></button>
                <button className="se-ico" aria-label={`Move step ${i + 1} down`} disabled={i === wf.steps.length - 1} onClick={() => change(moveStep(wf, i, 1))}><PixelIcon name="chevron" scale={2} /></button>
                <button className="se-ico" aria-label={`Remove step ${i + 1}`} disabled={wf.steps.length <= 1} onClick={() => change(removeStep(wf, i))}><PixelIcon name="x" scale={1} /></button>
              </div>
            </li>
          ))}
        </ol>
      )}
      {!wide && wf.steps.length < STEPS_MAX && <AddStepMenu onAdd={(k) => {
        const next = addStep(wf, k)
        change(next)
        setPicked(next.steps.findIndex((x) => !wf.steps.some((o) => o.id === x.id)))
      }} />}
      {problem && <p className="error se-problem" role="alert">{problem}</p>}
    </div>
  )
}
