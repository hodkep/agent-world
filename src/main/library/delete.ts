import { existsSync, lstatSync, readdirSync, realpathSync, rmSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { DeletePlan, LibraryItem } from '../../shared/library'
import type { Library } from './store'

export type { DeletePlan }

export interface DeleteContext {
  /** Every skills folder the app knows (global and each project's): a skill is deleted only from one of them. */
  roots: string[]
  rules: number
  tracked: (real: string, project: string) => Promise<boolean>
}

const real = (p: string) => {
  try {
    return realpathSync(p)
  } catch {
    return p
  }
}

/** Links inside the skills folders whose real target is `target`. */
function linksTo(target: string, roots: string[]): string[] {
  const out: string[] = []
  for (const root of roots) {
    let entries
    try {
      entries = readdirSync(root, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      const p = join(root, e.name)
      if (e.isSymbolicLink() && real(p) === target) out.push(p)
    }
  }
  return out
}

export async function planDelete(item: LibraryItem, ctx: DeleteContext, bytes?: number): Promise<DeletePlan> {
  const base = { id: item.id, name: item.name, files: [], links: [], rules: ctx.rules, tracked: false }
  const place = item.place
  if (!place) return { ...base, refused: 'It is kept in the library itself: remove it from the library to delete it.' }
  if (place.kind === 'plugin') return { ...base, refused: 'Claude manages the skills of its plugins, so they can only be removed from the library.' }
  if (!existsSync(place.real)) return base
  const roots = ctx.roots.map(real)
  const links = linksTo(real(place.real), ctx.roots)
  if (!roots.includes(real(dirname(place.real)))) {
    // A folder elsewhere (a shared harness folder) is the person's own when a skills folder links to it, unless it is a whole repository.
    if (!links.length) return { ...base, refused: 'It is not in a skills folder the app knows, so nothing was deleted.' }
    if (existsSync(join(place.real, '.git'))) return { ...base, refused: 'It is a git repository outside the skills folders, so it is not deleted: remove it from the library instead.' }
  }
  if (!existsSync(join(place.real, 'SKILL.md'))) return { ...base, refused: 'The folder holds no SKILL.md, so it is not deleted.' }
  const tracked = place.kind === 'project' && place.project ? await ctx.tracked(place.real, place.project) : false
  return { ...base, files: [{ path: place.real, ...(bytes !== undefined && { bytes }) }], links, tracked }
}

/** Removes what the plan lists, then the library's own link and record. A plan that was refused removes nothing. */
export async function deleteSkill(plan: DeletePlan, lib: Library): Promise<void> {
  if (plan.refused) throw new Error(plan.refused)
  for (const l of plan.links) if (lstatSync(l, { throwIfNoEntry: false })?.isSymbolicLink()) unlinkSync(l)
  for (const f of plan.files) rmSync(f.path, { recursive: true, force: true })
  await lib.remove(plan.id)
}
