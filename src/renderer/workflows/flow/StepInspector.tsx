import { setStep, type StepPatch } from '../../../shared/stepEdit'
import type { SkillState } from '../../../shared/skills'
import { GATES, type Gate, type Step, type Workflow, stepName } from '../../../shared/workflow'
import { SKILL_WORDS } from '../WorkflowList'
import { PixelIcon } from '../../chat/PixelIcon'
import { ACTOR, ACTOR_WORD, BRIEF_KINDS, GATE_WORDS, KIND_LABEL } from './stepFlow'

/**
 * The fields of one step, as the person changes them: its name, what it is told, the command of a check, where it stops, its tries and skills,
 * and moving or removing it. The same fields sit under a step card in the diagram and in each row of the plain list a narrow panel shows.
 */
export function StepInspector({ wf, at, skills, skillStates, change }: { wf: Workflow; at: number; /** Every skill that can be added. */ skills: string[]; skillStates: Record<string, SkillState>; change: (next: Workflow) => void; }) {
  const s: Step = wf.steps[at]!
  const n = at + 1
  const gates = GATES[s.kind]
  const patch = (p: StepPatch) => change(setStep(wf, at, p))
  return (
    <div className="si">
      <div className="si-top">
        <span className={`si-who a-${ACTOR[s.kind]}`}>
          <PixelIcon name={ACTOR[s.kind] === 'reviewer' ? 'review' : (ACTOR[s.kind] as 'agent' | 'command' | 'you')} />
          {ACTOR_WORD[ACTOR[s.kind]]} · {KIND_LABEL[s.kind]}
        </span>
        <input aria-label={`Name of step ${n}`} className="se-name" maxLength={40} value={s.name ?? ''} placeholder={stepName(s)} onChange={(e) => patch({ name: e.target.value })} />
      </div>
      {BRIEF_KINDS.includes(s.kind) && (
        <textarea aria-label={`Brief of step ${n}`} className="se-brief" rows={3} maxLength={600} value={s.brief ?? ''} placeholder="What the agent should do here (optional)" onChange={(e) => patch({ brief: e.target.value })} />
      )}
      {s.kind === 'check' && (
        <input aria-label={`Command of step ${n}`} className="se-run mono" maxLength={300} value={s.run ?? ''} placeholder="The command to run, such as npm test" onChange={(e) => patch({ run: e.target.value })} />
      )}
      <div className="se-opts">
        {gates.length > 1 && (
          <label>
            Stop
            <select aria-label={`Gate of step ${n}`} value={s.gate ?? gates[0]} onChange={(e) => patch({ gate: e.target.value as Gate })}>
              {gates.map((g) => <option key={g} value={g}>{GATE_WORDS[s.kind][g]}</option>)}
            </select>
          </label>
        )}
        {s.kind === 'check' && (
          <label>
            Tries
            <input aria-label={`Retries of step ${n}`} type="number" min={0} max={5} value={s.retries ?? ''} placeholder="2" onChange={(e) => patch({ retries: e.target.value === '' ? undefined : Number(e.target.value) })} />
          </label>
        )}
      </div>
      {s.kind === 'work' && (
        <div className="se-skills" aria-label={`Skills of step ${n}`}>
          {(s.skills ?? []).map((id) => (
            <span key={id} className={`sk ${skillStates[id] ?? 'ready'}`}>
              {id}
              {SKILL_WORDS[skillStates[id] ?? 'ready'] && <small> {SKILL_WORDS[skillStates[id] ?? 'ready']}</small>}
              <button aria-label={`Remove skill ${id} from step ${n}`} onClick={() => patch({ skills: (s.skills ?? []).filter((x) => x !== id) })}>
                <PixelIcon name="x" scale={1} />
              </button>
            </span>
          ))}
          {(s.skills ?? []).length < 8 && (
            <select aria-label={`Add a skill to step ${n}`} value="" onChange={(e) => e.target.value && patch({ skills: [...(s.skills ?? []), e.target.value] })}>
              <option value="">Add skill…</option>
              {skills.filter((id) => !(s.skills ?? []).includes(id)).map((id) => <option key={id} value={id}>{id}</option>)}
            </select>
          )}
        </div>
      )}
    </div>
  )
}
