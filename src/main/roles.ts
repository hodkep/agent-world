import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import type { Role } from '../shared/roles'
import type { AgentOptions } from '../shared/types'
import { providerOf } from './providers/registry'

// An agent file's model is one of the names the agent program knows.
const MODELS = new Set(providerOf({}).models.map((m) => m.value).filter(Boolean))
const MAX_INSTRUCTIONS = 6000

/** A Claude subagent definition: YAML-ish front matter (name, description, model, tools) then the system prompt. */
export function parseAgentFile(text: string, fallbackName: string) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text)
  const meta: Record<string, string> = {}
  if (m) for (const line of m[1]!.split(/\r?\n/)) {
    const kv = /^([A-Za-z_-]+):\s*(.*)$/.exec(line)
    if (kv) meta[kv[1]!.toLowerCase()] = kv[2]!.trim().replace(/^["']|["']$/g, '')
  }
  const model = meta.model && MODELS.has(meta.model) ? meta.model : undefined
  return { name: meta.name || fallbackName, description: meta.description ?? '', model, body: (m ? m[2]! : text).trim() }
}

function readAgents(dir: string, source: 'project' | 'your'): Role[] {
  let files: string[]
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.md')).sort()
  } catch {
    return []
  }
  return files.flatMap((f) => {
    try {
      const a = parseAgentFile(readFileSync(join(dir, f), 'utf8'), basename(f, '.md'))
      const options: AgentOptions = { role: a.name, ...(a.model && { model: a.model }), ...(a.body && { instructions: a.body.slice(0, MAX_INSTRUCTIONS) }) }
      return [{ id: `${source}:${a.name}`, title: a.name, blurb: a.description.slice(0, 160), source, options } satisfies Role]
    } catch {
      return []
    }
  })
}

/** Subagent definitions from the project (.claude/agents) and from the user's own .claude folder, offered as roles. */
export const discoverRoles = (projectDir: string, home: string): Role[] => [
  ...readAgents(join(projectDir, '.claude', 'agents'), 'project'),
  ...readAgents(join(home, '.claude', 'agents'), 'your')
]

export function loadRoles(file: string): Role[] {
  try {
    const d = JSON.parse(readFileSync(file, 'utf8'))
    return Array.isArray(d) ? (d as Role[]) : []
  } catch {
    return []
  }
}

function write(file: string, roles: Role[]) {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(roles, null, 2))
  renameSync(tmp, file)
}

/** Saves the given launch settings under a title; saving the same title again replaces it. */
export function saveRole(file: string, r: { title: string; blurb: string; options: AgentOptions; nameHint?: string }): Role {
  const title = r.title.trim().slice(0, 40)
  if (!title) throw new Error('Give the role a name.')
  const role: Role = {
    id: `saved:${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
    title,
    blurb: r.blurb.slice(0, 160),
    source: 'saved',
    ...(r.nameHint && { nameHint: r.nameHint }),
    options: { ...r.options, role: title }
  }
  write(file, [...loadRoles(file).filter((x) => x.id !== role.id), role])
  return role
}

export function deleteRole(file: string, id: string) {
  write(file, loadRoles(file).filter((x) => x.id !== id))
}
