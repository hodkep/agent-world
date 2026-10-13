import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { type ProposalView, type SaveHow, workflowDiff } from '../../shared/builder'
import { type Scope, type Workflow, type WorkflowEntry, checkCommands, isWorkflowId, parseWorkflow, stepName, toRunWorkflow } from '../../shared/workflow'
import { type SkillSource, goneSkills, skillList, skillStates } from '../../shared/skills'
import type { Approvals } from './approvals'
import type { WorkflowStore } from './store'

/** What a draft was made against: the saved file it would change (its content hash), or none. */
interface Base {
  scope: Scope
  hash: string
}
interface Draft {
  workflow: Workflow
  base: Base | null
  at: number
}

const FILE_MAX = 30_000
const SCOPE_NAME: { [k in Scope]: string } = { 'built-in': 'built in', global: 'everything', project: 'this project' }

/** The draft each builder agent has made, kept in a small file so it is still there after a restart. A damaged file means no drafts. */
export class Proposals {
  constructor(private file: string) {}

  private read(): { [agent: string]: Draft } {
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as { [k: string]: Partial<Draft> | null }
      return Object.fromEntries(Object.entries(raw).filter((e): e is [string, Draft] => !!e[1] && typeof e[1] === 'object' && typeof e[1].at === 'number' && !!e[1].workflow))
    } catch {
      return {}
    }
  }
  private write(all: { [agent: string]: Draft }) {
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify(all, null, 2))
    renameSync(tmp, this.file)
  }
  get(agent: string): Draft | undefined {
    return this.read()[agent]
  }
  set(agent: string, r: Draft) {
    this.write({ ...this.read(), [agent]: r })
  }
  clear(agent: string) {
    const all = this.read()
    if (!(agent in all)) return
    delete all[agent]
    this.write(all)
  }
}

interface Deps {
  store: WorkflowStore
  approvals: Approvals
  proposals: Proposals
  skills: SkillSource
  now: () => number
}

/** The builder agent's side of the office: what it may read, the drafts it hands in, and the saving that only the person does. */
export class Builder {
  constructor(private deps: Deps) {}

  /** The saved workflow with this id as the project would use it, if the file reads. */
  private saved(project: string | null, id: string): WorkflowEntry | undefined {
    return this.deps.store.list(project).find((e) => e.id === id && e.workflow)
  }
  private baseOf(e: WorkflowEntry | undefined): Base | null {
    return e ? { scope: e.scope, hash: e.hash ?? '' } : null
  }

  /** Every workflow the project can use, one line each, for the builder to read first. */
  list(project: string | null): string {
    const workflows = this.deps.store
      .list(project)
      .map((e) => {
        const where = SCOPE_NAME[e.scope]
        if (!e.workflow) return `- ${e.id} (${where}): does not read (${e.problems?.[0] ?? 'unknown problem'})`
        const w = e.workflow
        return `- ${e.id} (${where}): ${w.name}.${w.when ? ` When: ${w.when}` : ''} Steps: ${w.steps.map(stepName).join(', ')}`
      })
      .join('\n')
    return `${workflows}\n\nSkills you can name on a work step:\n${skillList(this.deps.skills.items(), this.deps.skills.playbook(project)).text}`
  }

  /** The workflows the project can use, each with how the skills its steps name stand: what the Workflows tab shows. */
  entries(project: string | null): WorkflowEntry[] {
    const items = this.deps.skills.items()
    const playbook = this.deps.skills.playbook(project)
    return this.deps.store.list(project).map((e) => {
      const states = e.workflow ? skillStates(e.workflow, items, playbook) : {}
      return Object.keys(states).length ? { ...e, skills: states } : e
    })
  }

  /** One workflow as its file. */
  get(project: string | null, id: string): string {
    if (!isWorkflowId(id)) throw new Error('Not a valid workflow id.')
    const e = this.deps.store.list(project).find((x) => x.id === id)
    if (!e) throw new Error(`No workflow "${id}".`)
    if (!e.workflow) return `The file ${id}.json does not read:\n${(e.problems ?? []).map((p) => `- ${p}`).join('\n')}`
    const note = e.scope === 'built-in' ? '(This one is built in. A proposal with the same id replaces it.)\n' : ''
    return `${note}${JSON.stringify(e.workflow, null, 2)}`
  }

  /** Takes the builder's file as its draft. A file with problems is refused with every problem named; the earlier draft stays. */
  propose(agent: string, project: string | null, text: string): string {
    if (text.length > FILE_MAX) throw new Error(`The file is too long (over ${FILE_MAX / 1000} thousand characters). Make the workflow shorter.`)
    const parsed = parseWorkflow(text)
    if (!parsed.ok) throw new Error(`Nothing was proposed, because the file has problems. Fix all of them and call workflow_propose again:\n${parsed.problems.map((p) => `- ${p}`).join('\n')}`)
    const gone = goneSkills(skillStates(parsed.workflow, this.deps.skills.items(), this.deps.skills.playbook(project)))
    if (gone.length) {
      const known = skillList(this.deps.skills.items(), this.deps.skills.playbook(project)).ids.slice(0, 40).join(', ')
      const lines = parsed.workflow.steps.flatMap((st, i) => (st.skills ?? []).filter((id) => gone.includes(id)).map((id) => `- Step ${i + 1} ("${st.id}"): there is no skill "${id}" in the library. Skills you can name: ${known || 'none'}.`))
      throw new Error(`Nothing was proposed, because the file has problems. Fix all of them and call workflow_propose again:\n${lines.join('\n')}`)
    }
    const saved = this.saved(project, parsed.workflow.id)
    if (saved && workflowDiff(saved.workflow, parsed.workflow).same) return `"${parsed.workflow.name}" is the saved workflow unchanged, so there is nothing to propose.`
    this.deps.proposals.set(agent, { workflow: parsed.workflow, base: this.baseOf(saved), at: this.deps.now() })
    const w = parsed.workflow
    return `Proposed "${w.name}" (${saved ? 'a change to the saved one' : 'new'}, ${w.steps.length} step${w.steps.length === 1 ? '' : 's'}). The person sees it beside this chat; only the person saves it, from a button there. Tell them in a sentence what it does.`
  }

  /** The agent's draft against what is saved now, or null when it has none. */
  view(agent: string, project: string | null): ProposalView | null {
    const r = this.deps.proposals.get(agent)
    if (!r) return null
    const saved = this.saved(project, r.workflow.id)
    const now = this.baseOf(saved)
    const stale = (r.base?.hash ?? null) !== (now?.hash ?? null) || (r.base?.scope ?? null) !== (now?.scope ?? null)
    const before = new Set(this.deps.approvals.previous(r.workflow.id, '')?.commands ?? [])
    return {
      workflow: r.workflow,
      diff: workflowDiff(saved?.workflow, r.workflow),
      ...(saved && { saved: { scope: saved.scope } }),
      stale,
      skills: skillStates(r.workflow, this.deps.skills.items(), this.deps.skills.playbook(project)),
      commands: checkCommands(toRunWorkflow(r.workflow)).map((text) => ({ text, known: before.has(text) })),
      at: r.at
    }
  }

  discard(agent: string) {
    this.deps.proposals.clear(agent)
  }

  /** Writes the draft where the person chose and approves its commands for that exact file. Nothing changes when this throws. */
  save(agent: string, project: string | null, how: SaveHow): WorkflowEntry {
    const v = this.view(agent, project)
    const r = this.deps.proposals.get(agent)
    if (!v || !r) throw new Error('Nothing is proposed.')
    if (v.stale) throw new Error('The saved workflow changed since the builder proposed this. Ask the builder to look at it again.')
    const placeOf = (scope: Scope | undefined): 'global' | 'project' => (scope === 'global' ? 'global' : 'project')
    let entry: WorkflowEntry
    if (how === 'project' || how === 'global') entry = this.deps.store.save(project, r.workflow, how)
    else if (how === 'replace') {
      if (!v.saved || v.saved.scope === 'built-in') throw new Error('There is no saved file to replace.')
      entry = this.deps.store.save(project, r.workflow, placeOf(v.saved.scope), { replace: true })
    } else {
      const taken = new Set(this.deps.store.list(project).map((e) => e.id))
      const base = r.workflow.id.slice(0, 36)
      let id = `${base}-2`
      for (let n = 3; taken.has(id); n++) id = `${base}-${n}`
      const name = `${r.workflow.name.slice(0, 60 - ' (2)'.length)} (2)`
      entry = this.deps.store.save(project, { ...r.workflow, id, name }, placeOf(v.saved?.scope))
    }
    const commands = checkCommands(toRunWorkflow(entry.workflow!))
    if (commands.length && entry.hash) this.deps.approvals.approve(entry.id, entry.hash, commands, this.deps.now())
    this.deps.proposals.clear(agent)
    return entry
  }
}
