import { type Role, type Who, kindFor, roleOf, whoOf, withRole, withWho } from '../../../shared/stepEdit'
import { setStep, type StepPatch } from '../../../shared/stepEdit'
import type { SkillState } from '../../../shared/skills'
import { OPTIONAL_KINDS, SKILL_KINDS, START_KINDS, type Step, type Workflow, stepName } from '../../../shared/workflow'
import { SKILL_WORDS } from '../WorkflowList'
import { PixelIcon } from '../../chat/PixelIcon'
import { AddItemMenu } from '../../panel/AddItemMenu'
import type { AddableItem } from '../../panel/addItemGroups'
import { BRIEF_HINT } from './stepFlow'

const WHO: { who: Who; label: string }[] = [
  { who: 'agent', label: 'Agent' },
  { who: 'command', label: 'Command' },
  { who: 'reviewer', label: 'Reviewer' },
  { who: 'you', label: 'You' }
]
const ICON = { agent: 'agent', command: 'command', reviewer: 'review', you: 'you' } as const
/** The part a step plays in the run, as the choice words it: what the agent or the person does there. */
const ROLES: Record<Who, { role: Role; label: string }[]> = {
  agent: [{ role: 'none', label: 'A step of work' }, { role: 'plan', label: 'The plan, approved before any edit' }, { role: 'pr', label: 'The pull request, held until the steps before it pass' }],
  you: [{ role: 'none', label: 'An approval' }, { role: 'land', label: 'Landing it into the base branch' }],
  command: [],
  reviewer: []
}
const WHO_HINT: Record<Who, string> = {
  agent: 'The agent does it, and says when it is done.',
  command: 'The app runs a command in the agent\'s worktree.',
  reviewer: 'A model reads the branch against the plan and reports what it finds.',
  you: 'It waits for you.'
}

/** A switch that is on or off, as a labelled button: the same control for every setting a step has. */
function Switch({ on, onChange, label, hint, disabled }: { on: boolean; onChange: (on: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <label className={`si-sw ${on ? 'on' : ''} ${disabled ? 'off' : ''}`} title={hint}>
      <input type="checkbox" role="switch" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

/**
 * The settings of one step. Every step has the same ones: who does it, what it is told, the part it plays, and the switches (starts when you press Run,
 * needs your approval, must pass, optional); a setting that does not fit the one who does it is not shown. The same fields sit beside the flow and in each row of the plain list.
 */
export function StepInspector({ wf, at, skills, skillStates, switches, change }: { wf: Workflow; at: number; /** Every skill that can be added. */ skills: AddableItem[]; skillStates: Record<string, SkillState>; /** What a step with no gate of its own follows. */ switches?: { planGate: boolean; mergeGate: boolean }; change: (next: Workflow) => void }) {
  const s: Step = wf.steps[at]!
  const n = at + 1
  const who = whoOf(s.kind)
  const role = roleOf(s.kind)
  const patch = (p: StepPatch) => change(setStep(wf, at, p))
  // Whether the person approves it: its own gate, else what the Settings switch comes to for a plan or a landing step.
  const approves = s.kind === 'approve' || (s.gate !== undefined ? s.gate === 'approve' : s.kind === 'plan' ? !!switches?.planGate : s.kind === 'pr' || s.kind === 'merge' ? !!switches?.mergeGate : false)
  const mustPass = s.kind === 'check' && (s.gate === 'pass' || s.gate === 'approve')
  const setApproval = (on: boolean) => {
    if (s.kind === 'check') return patch({ gate: on ? 'approve' : mustPass ? 'pass' : undefined })
    // A plan or a landing step with no gate follows its switch, so "no" is said outright.
    return patch({ gate: on ? 'approve' : s.kind === 'plan' || s.kind === 'pr' || s.kind === 'merge' ? 'auto' : undefined })
  }
  const roles = ROLES[who]
  return (
    <div className="si">
      <div className="si-who-row" role="group" aria-label={`Who does step ${n}`}>
        <span className="se-lbl">Who does it</span>
        <span className="se-seg">
          {WHO.map((o) => (
            <button key={o.who} className={who === o.who ? 'on' : ''} aria-pressed={who === o.who} title={WHO_HINT[o.who]} onClick={() => change(withWho(wf, at, o.who))}>
              <PixelIcon name={ICON[o.who]} scale={1} /> {o.label}
            </button>
          ))}
        </span>
      </div>
      <input aria-label={`Name of step ${n}`} className="se-name" maxLength={40} value={s.name ?? ''} placeholder={stepName(s)} onChange={(e) => patch({ name: e.target.value })} />
      <textarea aria-label={`Brief of step ${n}`} className="se-brief" rows={3} maxLength={600} value={s.brief ?? ''} placeholder={BRIEF_HINT[s.kind]} onChange={(e) => patch({ brief: e.target.value })} />
      {roles.length > 1 && (
        <label className="si-row">
          <span className="se-lbl">Part in the run</span>
          <select aria-label={`Part of step ${n}`} value={role} onChange={(e) => change(withRole(wf, at, e.target.value as Role))}>
            {roles.filter((r) => kindFor(who, r.role)).map((r) => <option key={r.role} value={r.role}>{r.label}</option>)}
          </select>
        </label>
      )}
      {s.kind === 'check' && (
        <div className="si-row">
          <span className="se-lbl">Command</span>
          <input aria-label={`Command of step ${n}`} className="se-run mono" maxLength={300} value={s.run ?? ''} placeholder="The command to run, such as npm test" onChange={(e) => patch({ run: e.target.value })} />
          <label className="si-inline">
            Retries
            <input aria-label={`Retries of step ${n}`} type="number" min={0} max={5} value={s.retries ?? ''} placeholder="2" onChange={(e) => patch({ retries: e.target.value === '' ? undefined : Number(e.target.value) })} />
          </label>
        </div>
      )}
      {s.kind === 'audit' && (
        <label className="si-row">
          <span className="se-lbl">Reviewer model</span>
          <input aria-label={`Model of step ${n}`} className="se-model" maxLength={40} value={s.model ?? ''} placeholder="by the dial" onChange={(e) => patch({ model: e.target.value })} />
        </label>
      )}
      {SKILL_KINDS.includes(s.kind) && (
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
            <AddItemMenu items={skills} added={new Set(s.skills ?? [])} onAdd={(id) => patch({ skills: [...(s.skills ?? []), id] })} words={{ label: 'Add skill…', title: 'Add a skill', placeholder: 'Search skills…', search: 'Search skills', here: 'already on this step', tag: 'on this step' }} />
          )}
        </div>
      )}
      <div className="si-switches" role="group" aria-label={`Settings of step ${n}`}>
        {START_KINDS.includes(s.kind) && s.kind !== 'plan' && (
          <div className="si-when">
            <div className="se-opts">
              <span className="se-lbl">Asks you</span>
              <span className="se-seg" role="group" aria-label={`Start of step ${n}`}>
                <button aria-pressed={s.start !== 'run'} className={s.start !== 'run' ? 'on' : ''} onClick={() => patch({ start: undefined })}>Goes ahead by itself</button>
                <button aria-pressed={s.start === 'run'} className={s.start === 'run' ? 'on' : ''} onClick={() => patch({ start: 'run' })}>Asks me first</button>
              </span>
            </div>
            <small className="muted">{s.start === 'run' ? 'It does not start until you say yes: the agent does nothing for it before. That is the one time it asks.' : 'It goes ahead as soon as its turn comes, and never asks.'}</small>
          </div>
        )}
        {s.kind === 'plan' && (
          <div className="si-when">
            <span className="se-lbl">When it is written</span>
            <Switch on={approves} label="Needs my approval" hint="Once the plan is written, the run waits for you to approve it or send it back before anything is edited." onChange={setApproval} />
          </div>
        )}
        {OPTIONAL_KINDS.includes(s.kind) && <Switch on={!!s.optional} label="Optional" hint="You can skip it, and the run goes on." onChange={(on) => patch({ optional: on ? true : undefined })} />}
      </div>
    </div>
  )
}
