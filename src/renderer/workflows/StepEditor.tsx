import { useEffect, useRef, useState } from 'react'
import { addStep, moveStep, removeStep, setStep } from '../../shared/stepEdit'
import type { SkillState } from '../../shared/skills'
import { SKILL_WORDS } from './WorkflowList'
import { GATES, STEPS_MAX, STEP_KINDS, type Gate, type StepKind, type Workflow, stepName } from '../../shared/workflow'

const KIND_LABEL: Record<StepKind, string> = { plan: 'plan', work: 'work', check: 'check', audit: 'review', approve: 'your approval', pr: 'pull request', merge: 'land' }
const GATE_WORDS: Record<StepKind, Record<string, string>> = {
  plan: { auto: 'no stop', approve: 'you approve' },
  work: { auto: 'no stop', approve: 'you approve' },
  check: { auto: 'only reports', pass: 'must pass' },
  audit: { auto: 'no stop', approve: 'you approve' },
  approve: { approve: 'you approve' },
  pr: { auto: 'follows the switch', approve: 'you confirm' },
  merge: { auto: 'follows the switch', approve: 'you confirm' }
}
const BRIEF_KINDS: StepKind[] = ['plan', 'work', 'approve']
const clean = (e: Error) => e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

/**
 * The builder's draft as steps the person can change in place: the name and brief as text, a work step's skills as chips, a check's command, tries and gate, a step moved or removed,
 * a step added. Every change goes to the office, which checks it like a file; what it says is wrong shows under the steps, and saving waits until nothing is.
 */
export function StepEditor({ agentId, folder, workflow, skillStates, at, edited, onProblem, onChanged }: { agentId: string; folder: string | null; workflow: Workflow; /** How each skill a step names stands in this project. */ skillStates: Record<string, SkillState>; /** When the draft last changed, as the office has it: a newer one from the builder replaces what is shown. */ at: number; edited?: number; onProblem: (problem: boolean) => void; onChanged: () => void }) {
  const [wf, setWf] = useState(workflow)
  const [problem, setProblem] = useState('')
  const [skills, setSkills] = useState<string[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const dirty = useRef(false)
  useEffect(() => {
    // The builder proposed again (or the edit was undone): show that, unless the person is in the middle of typing.
    if (!dirty.current) setWf(workflow)
  }, [workflow, at])
  useEffect(() => {
    void window.aw.library.list().then((l) => setSkills(l.items.filter((i) => i.kind === 'skill').map((i) => i.id).sort()), () => undefined)
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
  return (
    <div className="se" aria-label="Edit the steps">
      {edited ? (
        <div className="se-head">
          <span className="muted">You edited {edited === 1 ? '1 thing' : `${edited} things`}.</span>
          <button className="su-link" onClick={undo}>Undo edits</button>
        </div>
      ) : null}
      <ol className="se-steps" aria-label="Steps">
        {wf.steps.map((s, i) => {
          const n = i + 1
          const gates = GATES[s.kind]
          return (
            <li key={`${s.id}-${i}`} className={`se-step k-${s.kind}`}>
              <div className="se-top">
                <span className="se-n mono">{n}</span>
                <input aria-label={`Name of step ${n}`} className="se-name" maxLength={40} value={s.name ?? ''} placeholder={stepName(s)} onChange={(e) => change(setStep(wf, i, { name: e.target.value }))} />
                <span className="se-kind mono">{KIND_LABEL[s.kind]}</span>
                <button className="se-ico" aria-label={`Move step ${n} up`} disabled={i === 0} onClick={() => change(moveStep(wf, i, -1))}>▲</button>
                <button className="se-ico" aria-label={`Move step ${n} down`} disabled={i === wf.steps.length - 1} onClick={() => change(moveStep(wf, i, 1))}>▼</button>
                <button className="se-ico" aria-label={`Remove step ${n}`} disabled={wf.steps.length <= 1} onClick={() => change(removeStep(wf, i))}>✕</button>
              </div>
              {BRIEF_KINDS.includes(s.kind) && (
                <textarea aria-label={`Brief of step ${n}`} className="se-brief" rows={2} maxLength={600} value={s.brief ?? ''} placeholder="What the agent should do here (optional)" onChange={(e) => change(setStep(wf, i, { brief: e.target.value }))} />
              )}
              {s.kind === 'check' && (
                <input aria-label={`Command of step ${n}`} className="se-run mono" maxLength={300} value={s.run ?? ''} placeholder="The command to run, such as npm test" onChange={(e) => change(setStep(wf, i, { run: e.target.value }))} />
              )}
              <div className="se-opts">
                {gates.length > 1 && (
                  <label>
                    Stop
                    <select aria-label={`Gate of step ${n}`} value={s.gate ?? gates[0]} onChange={(e) => change(setStep(wf, i, { gate: e.target.value as Gate }))}>
                      {gates.map((g) => <option key={g} value={g}>{GATE_WORDS[s.kind][g]}</option>)}
                    </select>
                  </label>
                )}
                {s.kind === 'check' && (
                  <label>
                    Tries
                    <input aria-label={`Retries of step ${n}`} type="number" min={0} max={5} value={s.retries ?? ''} placeholder="2" onChange={(e) => change(setStep(wf, i, { retries: e.target.value === '' ? undefined : Number(e.target.value) }))} />
                  </label>
                )}
              </div>
              {s.kind === 'work' && (
                <div className="se-skills" aria-label={`Skills of step ${n}`}>
                  {(s.skills ?? []).map((id) => (
                    <span key={id} className={`sk ${skillStates[id] ?? 'ready'}`}>
                      {id}
                      {SKILL_WORDS[skillStates[id] ?? 'ready'] && <small> {SKILL_WORDS[skillStates[id] ?? 'ready']}</small>}
                      <button aria-label={`Remove skill ${id} from step ${n}`} onClick={() => change(setStep(wf, i, { skills: (s.skills ?? []).filter((x) => x !== id) }))}>✕</button>
                    </span>
                  ))}
                  {(s.skills ?? []).length < 8 && (
                    <select aria-label={`Add a skill to step ${n}`} value="" onChange={(e) => e.target.value && change(setStep(wf, i, { skills: [...(s.skills ?? []), e.target.value] }))}>
                      <option value="">＋ skill</option>
                      {skills.filter((id) => !(s.skills ?? []).includes(id)).map((id) => <option key={id} value={id}>{id}</option>)}
                    </select>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ol>
      {wf.steps.length < STEPS_MAX && (
        <select className="se-add" aria-label="Add a step" value="" onChange={(e) => e.target.value && change(addStep(wf, e.target.value as StepKind))}>
          <option value="">＋ Add step</option>
          {STEP_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
      )}
      {problem && <p className="error se-problem" role="alert">{problem}</p>}
    </div>
  )
}
