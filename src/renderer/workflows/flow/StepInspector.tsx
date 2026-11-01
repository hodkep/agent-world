import { type Role, type Who, kindFor, roleOf, whoCan, whoOf, withBy, withRole, withWho } from '../../../shared/stepEdit'
import { setStep, type StepPatch } from '../../../shared/stepEdit'
import type { SkillState } from '../../../shared/skills'
import { OPTIONAL_KINDS, SKILL_KINDS, SKIPPABLE_KINDS, START_KINDS, type Step, type Workflow, isSkippable, stepName } from '../../../shared/workflow'
import { SKILL_WORDS } from '../WorkflowList'
import { PixelIcon } from '../../chat/PixelIcon'
import { AddItemMenu } from '../../panel/AddItemMenu'
import type { AddableItem } from '../../panel/addItemGroups'
import { BRIEF_HINT } from './stepFlow'
import { Choice } from './Choice'

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
const FINISH: { by: 'agent' | 'person'; label: string; sub: string }[] = [
  { by: 'agent', label: 'The agent', sub: 'reports it done' },
  { by: 'person', label: 'Me', sub: 'I say how it went' }
]
const WHO_SHORT: Record<Who, string> = { agent: 'Works on its own', command: 'Runs a command', reviewer: 'A second agent reads it', you: 'You decide' }
const WHO_HINT: Record<Who, string> = {
  agent: 'The agent does it, and says when it is done.',
  command: 'The app runs a command in the agent\'s worktree.',
  reviewer: 'A model reads the branch against the plan and reports what it finds.',
  you: 'It waits for you.'
}

/** One rule of a step, as a chip that is on or off: the same control for every setting a step has. */
function Chip({ on, onChange, label, icon, hint }: { on: boolean; onChange: (on: boolean) => void; label: string; icon: 'play' | 'check' | 'optional' | 'skip'; hint: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={`si-chip ${on ? 'on' : ''}`} title={hint} onClick={() => onChange(!on)}>
      <PixelIcon name={icon} scale={2} />
      <span>{label}</span>
    </button>
  )
}


/**
 * The settings of one step. Every step has the same ones: who does it, what it is told, the part it plays, and the switches (starts when you press Run,
 * needs your approval, must pass, optional); a setting that does not fit the one who does it is not shown. The same fields sit beside the flow and in each row of the plain list.
 */
export function StepInspector({ wf, at, skills, skillStates, change }: { wf: Workflow; at: number; /** Every skill that can be added. */ skills: AddableItem[]; skillStates: Record<string, SkillState>; change: (next: Workflow) => void }) {
  const s: Step = wf.steps[at]!
  const n = at + 1
  const who = whoOf(s.kind)
  const role = roleOf(s.kind)
  const patch = (p: StepPatch) => change(setStep(wf, at, p))
  // Whether the person approves it: a plan unless its gate says auto, else its own gate.
  const approves = s.kind === 'approve' || (s.kind === 'plan' ? s.gate !== 'auto' : s.gate === 'approve')
  const mustPass = s.kind === 'check' && (s.gate === 'pass' || s.gate === 'approve')
  const setApproval = (on: boolean) => {
    if (s.kind === 'check') return patch({ gate: on ? 'approve' : mustPass ? 'pass' : undefined })
    // A plan or a landing step with no gate follows its switch, so "no" is said outright.
    return patch({ gate: on ? 'approve' : s.kind === 'plan' || s.kind === 'pr' || s.kind === 'merge' ? 'auto' : undefined })
  }
  // A part the app would read as work is not offered: it would turn back at once.
  const roles = ROLES[who].filter((r) => r.role === role || whoCan(who, r.role))
  const canStart = START_KINDS.includes(s.kind) && s.kind !== 'plan'
  const optionalKind = OPTIONAL_KINDS.includes(s.kind)
  const skippableKind = SKIPPABLE_KINDS.includes(s.kind)
  return (
    <div className="si">
      <div className="si-whorow" role="group" aria-label={`Who does step ${n}`}>
        <span className="si-icons">
          {WHO.filter((o) => o.who === who || whoCan(o.who, role)).map((o) => (
            <button key={o.who} type="button" className={`si-icon ${who === o.who ? 'on' : ''}`} aria-pressed={who === o.who} aria-label={o.label} title={`${o.label}: ${WHO_HINT[o.who]}`} onClick={() => change(withWho(wf, at, o.who))}>
              <PixelIcon name={ICON[o.who]} scale={2} />
            </button>
          ))}
        </span>
        <span className="si-whoname"><b>{WHO.find((o) => o.who === who)?.label}</b><small>{WHO_SHORT[who]}</small></span>
      </div>
      <div className="si-text">
        <input aria-label={`Name of step ${n}`} className="se-name si-title" maxLength={40} value={s.name ?? ''} placeholder={stepName(s)} onChange={(e) => patch({ name: e.target.value })} />
        <textarea aria-label={`Brief of step ${n}`} className="se-brief si-desc" rows={3} maxLength={600} value={s.brief ?? ''} placeholder={BRIEF_HINT[s.kind]} onChange={(e) => patch({ brief: e.target.value })} />
      </div>
      {s.kind === 'work' && (
        <div className="si-field">
          <div className="si-finish">
            <span className="se-lbl">Who finishes it</span>
            <div className="si-seg" role="group" aria-label={`Who finishes step ${n}`}>
              {FINISH.map((o) => (
                <button key={o.by} type="button" className={`si-segbtn ${(s.by ?? 'agent') === o.by ? 'on' : ''}`} aria-pressed={(s.by ?? 'agent') === o.by} title={o.sub} onClick={() => change(withBy(wf, at, o.by))}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          {s.by === 'person' && (
            <>
              <p className="si-hint">The agent does what the brief says, then reports the step. You answer once, on one card.</p>
              <label className="si-field">
                <span className="se-lbl">Done button</span>
                <input aria-label={`Done button of step ${n}`} className="si-plain" maxLength={40} value={s.confirm ?? ''} placeholder="Approve" onChange={(e) => patch({ confirm: e.target.value })} />
              </label>
              <label className="si-field">
                <span className="se-lbl">Send-back button</span>
                <input aria-label={`Send-back button of step ${n}`} className="si-plain" maxLength={40} value={s.reject ?? ''} placeholder="Send back" onChange={(e) => patch({ reject: e.target.value })} />
              </label>
            </>
          )}
        </div>
      )}
      {roles.length > 1 && (
        <div className="si-field">
          <span className="se-lbl">Part it plays</span>
          <Choice ariaLabel={`Part of step ${n}`} value={role} options={roles.filter((r) => kindFor(who, r.role)).map((r) => ({ value: r.role, label: r.label }))} onChange={(v) => change(withRole(wf, at, v as Role))} />
        </div>
      )}
      {s.kind === 'check' && (
        <div className="si-field">
          <span className="se-lbl">Command</span>
          <input aria-label={`Command of step ${n}`} className="se-run mono si-plain" maxLength={300} value={s.run ?? ''} placeholder="The command to run, such as npm test" onChange={(e) => patch({ run: e.target.value })} />
          <label className="si-inline">
            Retries
            <input aria-label={`Retries of step ${n}`} type="number" min={0} max={5} value={s.retries ?? ''} placeholder="2" onChange={(e) => patch({ retries: e.target.value === '' ? undefined : Number(e.target.value) })} />
          </label>
        </div>
      )}
      {s.kind === 'audit' && (
        <label className="si-field">
          <span className="se-lbl">Reviewer model</span>
          <input aria-label={`Model of step ${n}`} className="se-model si-plain" maxLength={40} value={s.model ?? ''} placeholder="by the dial" onChange={(e) => patch({ model: e.target.value })} />
        </label>
      )}
      {SKILL_KINDS.includes(s.kind) && (
        <div className="si-field">
        <span className="se-lbl">Skills</span>
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
        </div>
      )}
      {(canStart || s.kind === 'plan' || optionalKind || skippableKind) && (
        <div className="si-field" role="group" aria-label={`Settings of step ${n}`}>
          <span className="se-lbl">Rules</span>
          <div className="si-chips">
            {canStart && s.by !== 'person' && <Chip icon="play" label="Asks me first" on={s.start === 'run'} hint="It does not start until you say yes: the agent does nothing for it before. Off, it goes ahead as soon as its turn comes." onChange={(on) => patch({ start: on ? 'run' : undefined })} />}
            {s.kind === 'plan' && <Chip icon="check" label="Needs my approval" on={approves} hint="Once the plan is written, the run waits for you to approve it or send it back before anything is edited." onChange={setApproval} />}
            {optionalKind && <Chip icon="optional" label="Optional" on={!!s.optional} hint="The agent may skip it itself and say why. You can skip it too." onChange={(on) => patch({ optional: on ? true : undefined })} />}
            {skippableKind && <Chip icon="skip" label="Skippable" on={isSkippable(s)} hint="Only you can skip it, and the agent has to ask. Off, the step is required: Not now refuses it." onChange={(on) => patch({ skippable: on })} />}
          </div>
          {(optionalKind || skippableKind) && <p className="si-hint"><b>Skippable:</b> only you can skip it; the agent has to ask. <b>Optional:</b> the agent may skip it and say why.</p>}
        </div>
      )}
    </div>
  )
}
