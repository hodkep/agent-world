import { cpSync, lstatSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Item } from './store'

const SAFE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/

/**
 * The plugin folder Claude loads for one session only (`--plugin-dir`), holding exactly the skills this agent's playbook allows.
 * It is rebuilt at every launch, so nothing is installed and nothing global changes. Null when there is no skill to offer.
 */
export function writePluginDir(base: string, agentId: string, skills: Item[]): string | null {
  if (!SAFE.test(agentId)) throw new Error(`Not an agent id: ${agentId}`)
  const dir = join(base, agentId)
  rmSync(dir, { recursive: true, force: true })
  const withFolder = skills.filter((s) => s.kind === 'skill' && s.dir)
  if (withFolder.length === 0) return null
  mkdirSync(join(dir, '.claude-plugin'), { recursive: true })
  writeFileSync(join(dir, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'agent-world-library', version: '1.0.0', description: 'Skills this agent\'s playbook allows, from the Agent World library.' }))
  for (const s of withFolder) cpSync(s.dir, join(dir, 'skills', s.id), { recursive: true, filter: (p) => (!p.split(/[\\/]/).pop()!.startsWith('.') || p === s.dir) && !lstatSync(p).isSymbolicLink() })
  return dir
}
