import { mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Item } from './store'

const SAFE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/

/**
 * The plugin folder Claude loads for one session only (`--plugin-dir`), holding exactly the skills this agent's playbook allows.
 * It is rebuilt at every launch, so nothing is installed and nothing global changes; each skill in it is a link to its folder. Null when there is no skill to offer.
 */
export function writePluginDir(base: string, agentId: string, skills: Item[]): string | null {
  if (!SAFE.test(agentId)) throw new Error(`Not an agent id: ${agentId}`)
  const dir = join(base, agentId)
  rmSync(dir, { recursive: true, force: true })
  const withFolder = skills.filter((s) => s.kind === 'skill' && s.dir)
  if (withFolder.length === 0) return null
  mkdirSync(join(dir, '.claude-plugin'), { recursive: true })
  writeFileSync(join(dir, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'agent-world-library', version: '1.0.0', description: 'Skills this agent\'s playbook allows, from the Agent World library.' }))
  // Linked, not copied: a skill can be gigabytes, and a copy at every start would cost them every time. A link ends at the skill's real folder, whatever it is called here.
  mkdirSync(join(dir, 'skills'), { recursive: true })
  for (const s of withFolder) {
    try {
      symlinkSync(realpathSync(s.dir), join(dir, 'skills', s.id), 'dir')
    } catch {
      /* a skill whose folder is gone (a reference whose original was removed) is left out */
    }
  }
  return dir
}
