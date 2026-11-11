import { link, linkState, targets, unlink, type Target, type TargetId } from './links'

export type SkillScope = { scope: 'project'; folder: string } | { scope: 'projects' | 'global' | 'all' | 'keep-global' }
export interface SkillStep {
  action: 'link' | 'unlink'
  target: TargetId
  dir: string
  label: string
}
/** What a removal would do, shown before it is done; `left` are folders holding a copy of the same name, which are not ours to touch. */
export interface SkillRemovalPlan {
  steps: SkillStep[]
  left: string[]
}
export interface SkillRemovalContext {
  root: string
  home: string
  /** The projects the app knows. */
  projects: string[]
}

const GLOBAL: TargetId[] = ['claude', 'agy-cli', 'agy-app']
const key = (s: SkillStep) => `${s.action}:${s.dir}`

/**
 * Where a library skill is linked and what taking it out of some of those folders would do. Only our own links are taken away: a real folder or a link to something else of that
 * name is listed under `left` and kept. Keeping one global links it into the programs installed here first, so it is never in no place at all.
 */
export function planSkillRemoval(c: SkillRemovalContext, id: string, o: SkillScope): SkillRemovalPlan {
  if (o.scope === 'project' && !c.projects.includes(o.folder)) throw new Error('That is not a project the app knows.')
  const globals = targets(c.home).filter((t) => GLOBAL.includes(t.id))
  const folders = o.scope === 'project' ? [o.folder] : o.scope === 'global' ? [] : c.projects
  const projectT = folders.flatMap((f) => targets(c.home, f).filter((t) => !GLOBAL.includes(t.id)))
  const unlinkFrom: Target[] = [...(o.scope === 'global' || o.scope === 'all' ? globals : []), ...(o.scope === 'global' ? [] : projectT)]
  const steps: SkillStep[] = []
  const left: string[] = []
  const step = (action: SkillStep['action'], t: Target): void => void steps.push({ action, target: t.id, dir: t.dir, label: t.label })
  if (o.scope === 'keep-global') {
    for (const t of globals) {
      const st = linkState(c.root, id, t)
      if (st === 'none' && t.present) step('link', t)
      else if (st === 'copy') left.push(t.dir)
    }
  }
  for (const t of unlinkFrom) {
    const st = linkState(c.root, id, t)
    if (st === 'linked') step('unlink', t)
    else if (st === 'copy') left.push(t.dir)
  }
  return { steps, left }
}

/** Does a plan, if the folders still hold what it was made from; otherwise nothing is changed. */
export function applySkillRemoval(c: SkillRemovalContext, id: string, o: SkillScope, shown: SkillRemovalPlan): void {
  const now = planSkillRemoval(c, id, o)
  if (now.steps.map(key).join('\n') !== shown.steps.map(key).join('\n')) throw new Error('The folders changed since you were shown them. Look again.')
  const by = (s: SkillStep): Target => {
    const t = [...targets(c.home), ...c.projects.flatMap((f) => targets(c.home, f))].find((x) => x.id === s.target && x.dir === s.dir)
    if (!t) throw new Error('That folder is not one skills are linked into.')
    return t
  }
  for (const s of now.steps) (s.action === 'link' ? link : unlink)(c.root, id, by(s))
}
