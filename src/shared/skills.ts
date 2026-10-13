import type { Workflow } from './workflow'

/**
 * What a work step's skill is to the project it runs in. Ready: in the library and in the project's playbook. Granted: in the library only, so
 * the step lets agents read it while the task runs. Gone: not a skill of the library, so agents are told to skip it.
 */
export type SkillState = 'ready' | 'granted' | 'gone'

/** The part of a library item that decides whether it can be named as a skill. */
export interface SkillItem {
  id: string
  kind: string
  description: string
}

const DESCRIPTION_MAX = 100

/** Every skill id the workflow's steps name, each once, in the order they are named. */
export const namedSkills = (wf: Pick<Workflow, 'steps'>): string[] => [...new Set(wf.steps.flatMap((s) => s.skills ?? []))]

/** The state of each skill the workflow names. `playbook` holds the ids the project's playbook has switched on. */
export function skillStates(wf: Pick<Workflow, 'steps'>, library: SkillItem[], playbook: ReadonlySet<string>): Record<string, SkillState> {
  const skills = new Set(library.filter((i) => i.kind === 'skill').map((i) => i.id))
  return Object.fromEntries(namedSkills(wf).map((id): [string, SkillState] => [id, !skills.has(id) ? 'gone' : playbook.has(id) ? 'ready' : 'granted']))
}

export const goneSkills = (states: Record<string, SkillState>): string[] => Object.keys(states).filter((id) => states[id] === 'gone')

/** The skills a builder may name, ready ones first, as lines it reads; `ids` is all of them. Past `max` lines the rest are named by id only. */
export function skillList(library: SkillItem[], playbook: ReadonlySet<string>, max = 40): { text: string; ids: string[] } {
  const skills = library.filter((i) => i.kind === 'skill').sort((a, b) => Number(playbook.has(b.id)) - Number(playbook.has(a.id)) || a.id.localeCompare(b.id))
  if (skills.length === 0) return { text: 'The library has no skills.', ids: [] }
  const line = (s: SkillItem) => {
    const what = s.description.length > DESCRIPTION_MAX ? `${s.description.slice(0, DESCRIPTION_MAX - 1)}…` : s.description
    return `- ${s.id}: ${what}${playbook.has(s.id) ? '' : " (not in this project's playbook; a step that names it lets agents read it)"}`
  }
  const rest = skills.slice(max)
  const lines = skills.slice(0, max).map(line)
  if (rest.length) lines.push(`and ${rest.length} more, by id: ${rest.map((s) => s.id).join(', ')}`)
  return { text: lines.join('\n'), ids: skills.map((s) => s.id) }
}

/** Where the app finds out what the library holds and what a project's playbook switched on. */
export interface SkillSource {
  items: () => SkillItem[]
  playbook: (project: string | null) => ReadonlySet<string>
}
