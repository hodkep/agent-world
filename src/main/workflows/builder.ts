import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { type HistoryEntry, type ProposalView, type SaveHow, diffSummary, workflowDiff } from '../../shared/builder'
import { type Scope, type Workflow, type WorkflowEntry, checkCommands, isWorkflowId, parseWorkflow, stepName, toRunWorkflow } from '../../shared/workflow'
import { type SkillSource, goneSkills, skillList, skillStates } from '../../shared/skills'
import type { Approvals } from './approvals'
import { type WorkflowHistory, historyKey } from './history'
import type { WorkflowStore } from './store'

/** What a draft was made against: the saved file it would change (its content hash), or none. */
interface Base {
  scope: Scope
  hash: string
}
interface Draft {
  workflow: Workflow
  /** The workflow as the builder proposed it, so the person's edits can be counted and undone. */
  origin?: Workflow
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
  history: WorkflowHistory
  skills: SkillSource
  now: () => number
}

/** How many things the person changed in the builder's draft: steps added, removed, changed or moved, and the name or the "when". */
function editedCount(r: Draft): number {
  if (!r.origin) return 0
  const d = workflowDiff(r.origin, r.workflow)
  return d.added.length + d.removed.length + d.changed.length + (d.reordered ? 1 : 0) + (d.name ? 1 : 0) + (d.when ? 1 : 0)
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

  /** One line for each skill a step names that the library has not got, with the skills there are. */
  private unknownSkills(w: Workflow, project: string | null): string[] {
    const gone = goneSkills(skillStates(w, this.deps.skills.items(), this.deps.skills.playbook(project)))
    if (!gone.length) return []
    const known = skillList(this.deps.skills.items(), this.deps.skills.playbook(project)).ids.slice(0, 40).join(', ')
    return w.steps.flatMap((st, i) => (st.skills ?? []).filter((id) => gone.includes(id)).map((id) => `- Step ${i + 1} ("${st.id}"): there is no skill "${id}" in the library. Skills you can name: ${known || 'none'}.`))
  }

  /** Takes the builder's file as its draft. A file with problems is refused with every problem named; the earlier draft stays. */
  propose(agent: string, project: string | null, text: string): string {
    if (text.length > FILE_MAX) throw new Error(`The file is too long (over ${FILE_MAX / 1000} thousand characters). Make the workflow shorter.`)
    const parsed = parseWorkflow(text)
    if (!parsed.ok) throw new Error(`Nothing was proposed, because the file has problems. Fix all of them and call workflow_propose again:\n${parsed.problems.map((p) => `- ${p}`).join('\n')}`)
    const unknown = this.unknownSkills(parsed.workflow, project)
    if (unknown.length) throw new Error(`Nothing was proposed, because the file has problems. Fix all of them and call workflow_propose again:\n${unknown.join('\n')}`)
    const saved = this.saved(project, parsed.workflow.id)
    if (saved && workflowDiff(saved.workflow, parsed.workflow).same) return `"${parsed.workflow.name}" is the saved workflow unchanged, so there is nothing to propose.`
    this.deps.proposals.set(agent, { workflow: parsed.workflow, origin: parsed.workflow, base: this.baseOf(saved), at: this.deps.now() })
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
      ...(editedCount(r) > 0 && { edited: editedCount(r) }),
      at: r.at
    }
  }

  /**
   * The person's edit of the draft: the whole workflow as they have it now. It goes through the same checker as a file, so a bad edit comes back with every problem
   * named and the draft stays as it was. The id cannot change (it names the file).
   */
  edit(agent: string, project: string | null, input: unknown): ProposalView {
    const r = this.deps.proposals.get(agent)
    if (!r) throw new Error('Nothing is proposed.')
    const parsed = parseWorkflow(JSON.stringify(input))
    if (!parsed.ok) throw new Error(`The edit has problems:\n${parsed.problems.map((p) => `- ${p}`).join('\n')}`)
    if (parsed.workflow.id !== r.workflow.id) throw new Error('The id cannot change: it names the file. Use Save as a new workflow for another id.')
    const unknown = this.unknownSkills(parsed.workflow, project)
    if (unknown.length) throw new Error(`The edit has problems:\n${unknown.join('\n')}`)
    this.deps.proposals.set(agent, { ...r, workflow: parsed.workflow, origin: r.origin ?? r.workflow, at: this.deps.now() })
    return this.view(agent, project)!
  }

  /** Back to what the builder proposed. */
  undoEdits(agent: string, project: string | null): ProposalView {
    const r = this.deps.proposals.get(agent)
    if (!r) throw new Error('Nothing is proposed.')
    this.deps.proposals.set(agent, { ...r, workflow: r.origin ?? r.workflow, at: this.deps.now() })
    return this.view(agent, project)!
  }

  /** The saved workflow with this id, as an entry with its scope; throws when there is none. */
  private entryOf(project: string | null, id: string): WorkflowEntry {
    if (!isWorkflowId(id)) throw new Error('Not a valid workflow id.')
    const e = this.deps.store.list(project).find((x) => x.id === id)
    if (!e) throw new Error(`No workflow "${id}".`)
    return e
  }

  /** The changes saved through the builder to this workflow, newest first. */
  historyOf(project: string | null, id: string): HistoryEntry[] {
    const e = this.entryOf(project, id)
    return e.scope === 'built-in' ? [] : this.deps.history.list(historyKey(project, e.scope, e.id))
  }

  /** The same, as lines for the builder to read. */
  history(project: string | null, id: string): string {
    const entries = this.historyOf(project, id)
    if (entries.length === 0) return `No change has been saved through the builder yet for "${id}".`
    const WHAT: Record<SaveHow, string> = { project: 'saved to the project', global: 'saved for everything', replace: 'replaced the saved one', copy: 'saved as a copy' }
    const when = (t: number) => {
      const d = new Date(t)
      const p = (n: number) => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
    }
    return entries.map((h) => `${when(h.at)} · ${WHAT[h.how]} · ${h.summary}`).join('\n')
  }

  /** Starts an edit of a saved workflow: it becomes the draft, so it can be edited in place and compared with what is saved. An earlier draft is dropped. */
  startEdit(agent: string, project: string | null, id: string): ProposalView {
    const e = this.entryOf(project, id)
    if (!e.workflow) throw new Error(`The workflow "${id}" does not read, so it cannot be edited here:\n${(e.problems ?? []).map((p) => `- ${p}`).join('\n')}`)
    this.deps.proposals.set(agent, { workflow: e.workflow, origin: e.workflow, base: this.baseOf(e), at: this.deps.now() })
    return this.view(agent, project)!
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
    // What the save changed is written down, so the builder can read why the workflow is the way it is.
    const summary = how === 'copy' ? `a copy of ${r.workflow.id}${v.diff.same ? '' : `; ${diffSummary(v.diff)}`}` : diffSummary(v.diff)
    this.deps.history.add(historyKey(project, entry.scope, entry.id), { at: this.deps.now(), how, by: 'you', summary })
    this.deps.proposals.clear(agent)
    return entry
  }
}
