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
/** The settings popup's width, and the room kept between it and the picked step. */

/**
 * The builder's draft as a flow of steps the person can change in place: click a card to change its name, brief, command, gate and skills, drag it to move it, add or remove steps.
 * In a narrow panel the same steps are a plain list. Every change goes to the office, which checks it like a file; what it says is wrong shows under the steps, and saving waits until nothing is.
 */
export function StepEditor({ agentId, folder, workflow, skillStates, at, edited, marks, fill, onProblem, onChanged }: { /** The steps the draft added or changed, by id, to be drawn so. */ marks?: Record<string, 'new' | 'changed'>; /** The flow takes the height of the room it is given. */ fill?: boolean; agentId: string; folder: string | null; workflow: Workflow; /** How each skill a step names stands in this project. */ skillStates: Record<string, SkillState>; /** When the draft last changed, as the office has it: a newer one from the builder replaces what is shown. */ at: number; edited?: number; onProblem: (problem: boolean) => void; onChanged: () => void }) {
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
  useEffect(() => {
    const el = root.current
    if (!el) return
    const look = () => setWide(el.clientWidth === 0 || el.clientWidth >= FLOW_MIN)
    look()
    const watch = new ResizeObserver(look)
    watch.observe(el)
    return () => watch.disconnect()
  }, [])
  const [picked, setPicked] = useState<number | null>(null)
  const cur = picked !== null && picked < wf.steps.length ? picked : null
  // A picked step's settings are a column beside the flow: the flow makes room for it, and nothing is dimmed or blocked. A press anywhere else, or Escape,
  // puts it away; pressing another card opens that card's settings instead.
  const body = useRef<HTMLDivElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (cur === null) return
    const away = (e: MouseEvent) => {
      const t = e.target as Element
      // Cards switch the popup to themselves, and the flow's own buttons and menus (add a step, zoom) are not a press "outside".
      if (pop.current?.contains(t) || t.closest('.react-flow__node, .react-flow__edgelabel-renderer, .react-flow__panel, [role=menu], [role=dialog]')) return
      setPicked(null)
    }
    const key = (e: KeyboardEvent) => {
      // Escape puts this away and no more: the window around it stays open.
      if (e.key === 'Escape') {
        e.stopPropagation()
        setPicked(null)
      }
    }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', key)
    }
  }, [cur])
  const drop = (from: number, to: number) => {
    change(moveStepTo(wf, from, to))
    setPicked(to)
  }
  return (
    <div className={`se ${fill ? 'fills' : ''}`} aria-label="Edit the steps" ref={root}>
      {edited ? (
        <div className="se-head">
          <span className="muted">You edited {edited === 1 ? '1 thing' : `${edited} things`}.</span>
          <button className="su-link" onClick={undo}>Undo edits</button>
        </div>
      ) : null}
      {wide ? (
        <div className={`se-body ${cur === null ? '' : 'has-pick'}`} ref={body}>
          <FlowCanvas
            {...(fill && { fill: true })}
            {...(marks && { marks })}
            steps={wf.steps}
            selected={cur}
            skillStates={skillStates}
           
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
            <p className="se-hint muted">Click a step to change it · drag to move it · + on an arrow adds a step there</p>
          ) : (
            <div className="se-pick dock" role="dialog" aria-label={`Settings of step ${cur + 1}`} ref={pop}>
              <StepInspector wf={wf} at={cur} skills={skills} skillStates={skillStates} change={change} />
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
              <StepInspector wf={wf} at={i} skills={skills} skillStates={skillStates} change={change} />
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
