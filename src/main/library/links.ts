import { existsSync, lstatSync, mkdirSync, readlinkSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const SAFE = /^[a-z0-9][a-z0-9-]*$/

export type TargetId = 'claude' | 'agy-cli' | 'agy-app' | 'project-claude' | 'project'
export interface Target {
  id: TargetId
  label: string
  /** The folder the program reads skills from. */
  dir: string
  /** The program's own folder is here, so linking into it is offered. */
  present: boolean
}
/** none: nothing there · linked: our link to the library copy · copy: something else of that name is there, left alone. */
export type LinkState = 'none' | 'linked' | 'copy'

/** The places other than the app's own Claude sessions that read skills from a folder. The open project's is listed only when there is one. */
export function targets(home: string, folder?: string): Target[] {
  const at = (id: TargetId, label: string, parent: string, ...rest: string[]): Target => ({ id, label, dir: join(parent, ...rest), present: existsSync(parent) })
  return [
    at('claude', 'Claude (outside the app)', join(home, '.claude'), 'skills'),
    at('agy-cli', 'Antigravity CLI', join(home, '.gemini', 'antigravity-cli'), 'skills'),
    at('agy-app', 'Antigravity app', join(home, '.gemini', 'config'), 'skills'),
    // A project's own folders: Claude Code reads .claude/skills, Antigravity reads .agents/skills.
    ...(folder ? [at('project-claude', 'This project (Claude Code)', folder, '.claude', 'skills'), at('project', 'This project (Antigravity)', folder, '.agents', 'skills')] : [])
  ]
}

const copyOf = (root: string, id: string) => join(root, 'skills', id)
const check = (id: string) => {
  if (!SAFE.test(id)) throw new Error(`Not a library skill: ${id}`)
}

/** Whether the target's folder holds our link to this skill, a different thing of the same name, or nothing. */
export function linkState(root: string, id: string, t: Target): LinkState {
  check(id)
  const p = join(t.dir, id)
  try {
    if (!lstatSync(p).isSymbolicLink()) return 'copy'
    if (resolve(dirname(p), readlinkSync(p)) === copyOf(root, id)) return 'linked'
    // A link that leads to the same real folder is the same skill there, whoever made it (the skills CLI links the folder it installs).
    try {
      return realpathSync(p) === realpathSync(copyOf(root, id)) ? 'linked' : 'copy'
    } catch {
      return 'copy' // a link to nowhere is something else of that name: left alone
    }
  } catch {
    return 'none'
  }
}

export function link(root: string, id: string, t: Target): void {
  if (linkState(root, id, t) === 'linked') return
  if (linkState(root, id, t) === 'copy') throw new Error(`${id} is already in ${t.dir}: a copy there is left as it is.`)
  if (!existsSync(join(copyOf(root, id), 'SKILL.md'))) throw new Error(`${id} is not in the library.`)
  mkdirSync(t.dir, { recursive: true })
  symlinkSync(copyOf(root, id), join(t.dir, id), 'dir')
}

/** Takes away our link only; a real folder or a link to somewhere else is never touched. */
export function unlink(root: string, id: string, t: Target): void {
  if (linkState(root, id, t) === 'linked') rmSync(join(t.dir, id), { force: true })
}
