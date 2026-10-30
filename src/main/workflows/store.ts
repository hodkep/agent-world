import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { STANDARD, type Scope, type Workflow, type WorkflowEntry as Entry, isWorkflowId, parseWorkflow } from '../../shared/workflow'

const FILE_MAX = 100_000
const projectDir = (project: string) => join(project, '.agent-world', 'workflows')

/** Workflow files in two folders: the app's own (global) and one per project, a project's winning on the same id. */
export class WorkflowStore {
  constructor(private globalDir: string) {}

  private read(dir: string, scope: Scope): Entry[] {
    let files: string[]
    try {
      files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
    } catch {
      return []
    }
    return files.map((f) => this.entryOf(dir, f, scope))
  }

  private entryOf(dir: string, f: string, scope: Scope): Entry {
    const file = join(dir, f)
    const base = f.slice(0, -'.json'.length)
    if (statSync(file).size > FILE_MAX) return { id: base, scope, file, problems: ['The file is larger than 100 KB.'] }
    const text = readFileSync(file, 'utf8')
    const hash = createHash('sha256').update(text).digest('hex').slice(0, 16)
    const parsed = parseWorkflow(text)
    if (!parsed.ok) return { id: base, scope, file, hash, problems: parsed.problems }
    if (parsed.workflow.id !== base) return { id: base, scope, file, hash, problems: [`The id "${parsed.workflow.id}" does not match the file name "${f}". Rename the file or the id.`] }
    return { id: base, scope, workflow: parsed.workflow, file, hash }
  }

  list(project: string | null): Entry[] {
    const found = new Map<string, Entry>()
    const broken: Entry[] = []
    // Project files come first, so a global one with the same id is the one that is shadowed.
    for (const e of [...(project ? this.read(projectDir(project), 'project') : []), ...this.read(this.globalDir, 'global')]) {
      if (e.problems) {
        broken.push(e)
        continue
      }
      const won = found.get(e.id)
      if (!won) found.set(e.id, e)
      else if (!won.overrides) won.overrides = e.scope
    }
    const std = found.get('standard')
    if (std) std.overrides = 'built-in'
    const standard: Entry = std ?? { id: 'standard', scope: 'built-in', workflow: STANDARD }
    found.delete('standard')
    return [standard, ...[...found.values()].sort((a, b) => a.workflow!.name.localeCompare(b.workflow!.name)), ...broken.sort((a, b) => a.id.localeCompare(b.id))]
  }

  /** When the file behind this id (the project's, else the app's) last changed, in milliseconds; 0 for the built-in Standard or an id that has no file. */
  changedAt(project: string | null, id: string): number {
    const file = this.list(project).find((e) => e.id === id)?.file
    try {
      return file ? statSync(file).mtimeMs : 0
    } catch {
      return 0
    }
  }

  private dirFor(project: string | null, scope: 'global' | 'project') {
    if (scope === 'global') return this.globalDir
    if (!project) throw new Error('Open a project first.')
    return projectDir(project)
  }

  /** A copy of a workflow in the chosen place, under the first free id of the form `<id>-copy`, `<id>-copy-2`, and so on. */
  duplicate(project: string | null, id: string, to: 'global' | 'project'): Entry {
    if (!isWorkflowId(id)) throw new Error('Not a valid workflow id.')
    const dir = this.dirFor(project, to)
    const from = this.list(project).find((e) => e.id === id)
    if (!from) throw new Error('No such workflow.')
    if (!from.workflow) throw new Error('That file has problems, so it cannot be copied.')
    const base = id.slice(0, 33)
    let copy = `${base}-copy`
    for (let n = 2; existsSync(join(dir, `${copy}.json`)); n++) copy = `${base}-copy-${n}`
    const workflow: Workflow = { ...from.workflow, id: copy, name: `${from.workflow.name.slice(0, 60 - ' (copy)'.length)} (copy)` }
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, `${copy}.json`), JSON.stringify(workflow, null, 2) + '\n')
    return this.entryOf(dir, `${copy}.json`, to)
  }

  /** Every project but the current one, with the workflows it keeps itself (its own folder, not the app's, and not files that do not read), for picking one to import. */
  others(projects: string[], current: string | null): { project: string; workflows: Entry[] }[] {
    return projects.filter((p) => p !== current).map((project) => ({ project, workflows: this.read(projectDir(project), 'project').filter((e) => e.workflow) }))
  }

  /** A workflow kept by another project, copied into the chosen place with its own id and name; under `<id>-copy`, `<id>-copy-2` and so on only when that id is taken. */
  importFrom(source: string, id: string, project: string | null, to: 'global' | 'project'): Entry {
    if (!isWorkflowId(id)) throw new Error('Not a valid workflow id.')
    const dir = this.dirFor(project, to)
    const from = this.read(projectDir(source), 'project').find((e) => e.id === id)
    if (!from) throw new Error('No such workflow.')
    if (!from.workflow) throw new Error('That file has problems, so it cannot be imported.')
    let made = from.workflow
    if (existsSync(join(dir, `${id}.json`))) {
      let copy = `${id.slice(0, 33)}-copy`
      for (let n = 2; existsSync(join(dir, `${copy}.json`)); n++) copy = `${id.slice(0, 33)}-copy-${n}`
      made = { ...made, id: copy, name: `${made.name.slice(0, 60 - ' (copy)'.length)} (copy)` }
    }
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, `${made.id}.json`), JSON.stringify(made, null, 2) + '\n')
    return this.entryOf(dir, `${made.id}.json`, to)
  }

  /** Writes a workflow as a file in the chosen place. It refuses to replace a file that is there unless told to, and a workflow the file check refuses. */
  save(project: string | null, workflow: Workflow, to: 'global' | 'project', o: { replace?: boolean } = {}): Entry {
    const text = JSON.stringify(workflow, null, 2) + '\n'
    const checked = parseWorkflow(text)
    if (!checked.ok) throw new Error(checked.problems.join(' '))
    const dir = this.dirFor(project, to)
    const name = `${workflow.id}.json`
    if (!o.replace && existsSync(join(dir, name))) throw new Error(`There is already a workflow "${workflow.id}" in that place.`)
    mkdirSync(dir, { recursive: true })
    // Written beside the file and moved over it, so a reader never sees half of one.
    const tmp = join(dir, `${name}.tmp`)
    writeFileSync(tmp, text)
    renameSync(tmp, join(dir, name))
    return this.entryOf(dir, name, to)
  }

  /** Deletes the workflow's file from the chosen place. */
  remove(project: string | null, id: string, scope: 'global' | 'project') {
    if (!isWorkflowId(id)) throw new Error('Not a valid workflow id.')
    const file = join(this.dirFor(project, scope), `${id}.json`)
    if (!existsSync(file)) throw new Error(id === 'standard' ? 'The built-in Standard cannot be deleted. Copy it to change it.' : 'No such workflow.')
    unlinkSync(file)
  }
}
