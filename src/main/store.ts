import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { type AgentRecord, DEFAULT_PROVIDER } from '../shared/types'

export function loadAgents(file: string): AgentRecord[] {
  if (!existsSync(file)) return []
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'))
    if (!Array.isArray(data)) throw new Error('agents.json is not an array')
    return (data as AgentRecord[]).map((a) => ({ ...a, provider: a.provider ?? DEFAULT_PROVIDER }))
  } catch (err) {
    // Keep the bad file for inspection; starting empty must not overwrite it on next save.
    const aside = `${file}.corrupt-${Date.now()}`
    renameSync(file, aside)
    console.error(`agent store unreadable, moved to ${aside}:`, err)
    return []
  }
}

export function saveAgents(file: string, agents: AgentRecord[]) {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(agents, null, 2))
  renameSync(tmp, file)
}
