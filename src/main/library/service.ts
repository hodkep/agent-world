import { lstatSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, isAbsolute } from 'node:path'
import { Library, type Item } from './store'
import { Playbooks, compile, merge, type Compiled, type Rule } from './playbook'
import { writePluginDir } from './pluginDir'
import { matchItems } from './match'
import { buildCatalog } from './catalog'
import { UseLog, summarize, type How, type Summary, type Use } from './uses'

export interface AgentRef {
  id: string
  name: string
  repoPath: string
  provider: string
}

export interface IndexEntry {
  id: string
  kind: Item['kind']
  name: string
  description: string
  /** What reading it costs. */
  tokens: number
  mode: Rule['mode']
  when: string
}

interface Deps {
  /** The library folder (global, in the app's data folder). */
  root: string
  agent: (id: string) => AgentRef | undefined
  /** A short file-name-safe key for a workspace. */
  workspaceKey: (repoPath: string) => string
  /** Called when an agent has a new entry in the log, so a screen showing it can refresh. */
  onUse?: (agentId: string, how: How) => void
}

const MAX_FILE = 100 * 1024

/** The library as agents use it: what each one is told when it starts, what it may ask for, and a record of what it fetched. */
export function createLibraryService(d: Deps) {
  const library = new Library(d.root)
  const playbooks = new Playbooks(d.root)
  const log = new UseLog(join(d.root, 'uses.jsonl'))
  // Per agent: how many prompts it has had, whether it can fetch, its per-turn rule reminder, and whether the full catalog is due again.
  const state = new Map<string, { launch: number; turn: number; canFetch: boolean; native: boolean; reminder: string; catalogDue: boolean }>()
  const CATALOG_EVERY = 10
  const MATCHES = 3

  const rulesFor = (repoPath: string): Rule[] => merge(playbooks.read('global'), playbooks.read({ workspace: d.workspaceKey(repoPath) }))
  const itemsMap = () => new Map(library.listSync().map((i) => [i.id, i]))
  const agentOrThrow = (id: string) => {
    const a = d.agent(id)
    if (!a) throw new Error('Unknown agent.')
    return a
  }
  const notAllowed = (id: string) => new Error(`${id} is not in this workspace's playbook. Call library_index to see what is available.`)

  /** The rules and what they compile to for a workspace, before any agent is involved (the Settings preview uses this). */
  function compileFor(repoPath: string, canFetch: boolean): Compiled & { rules: Rule[] } {
    const rules = rulesFor(repoPath)
    return { ...compile(rules, itemsMap(), { canFetch }), rules }
  }

  function entriesFor(repoPath: string): IndexEntry[] {
    const items = itemsMap()
    const order = { always: 0, 'on-demand': 1, step: 2, off: 3 }
    return rulesFor(repoPath)
      .filter((r) => r.mode !== 'off' && items.has(r.id))
      .sort((x, y) => order[x.mode] - order[y.mode])
      .map((r) => {
        const i = items.get(r.id)!
        return { id: i.id, kind: i.kind, name: i.name, description: i.description, tokens: i.tokens.body, mode: r.mode, when: r.when }
      })
  }

  const indexSync = (agentId: string) => entriesFor(agentOrThrow(agentId).repoPath)
  const index = async (agentId: string) => indexSync(agentId)

  function record(agentId: string, id: string, how: How, mode?: string, words?: string) {
    const a = d.agent(agentId)
    if (!a) return
    // Hooks see every Skill call and Read; only the library's own items count.
    if ((how === 'skill' || how === 'read') && !itemsMap().has(id)) return
    log.add({ agent: a.id, name: a.name, provider: a.provider, workspace: d.workspaceKey(a.repoPath), id, how, mode, turn: state.get(agentId)?.turn, launch: state.get(agentId)?.launch, words })
    d.onUse?.(a.id, how)
  }

  return {
    library,
    playbooks,
    rulesFor,
    compileFor,
    index,

    /** At launch: the opening text for this agent, and (for the program that can load them) the folder of skills it is allowed. */
    prepare(agentId: string, canFetch: boolean, native = false): { core: string; reminder: string; pluginDir: string | null; compiled: Compiled } {
      const a = agentOrThrow(agentId)
      const compiled = compileFor(a.repoPath, canFetch) as Compiled
      state.set(a.id, { launch: Date.now(), turn: 0, canFetch, native, reminder: compiled.reminder, catalogDue: false })
      const entries = indexSync(a.id)
      const onDemand = entries.some((e) => e.mode === 'on-demand')
      // The catalog is a file so an agent that has lost track can read it again; the opening text says where.
      let core = compiled.core
      if (onDemand) {
        const file = join(d.root, 'catalog', `${d.workspaceKey(a.repoPath)}.md`)
        mkdirSync(dirname(file), { recursive: true })
        writeFileSync(file, buildCatalog(entries) + '\n')
        core += `${core ? '\n\n' : ''}If you cannot recall what the library holds, read ${file}. Items that match your task are pointed out as you go; use them.`
      }
      record(a.id, '', 'started', undefined, core)
      for (const e of entries) if (e.mode === 'always') record(a.id, e.id, 'delivered', e.mode)
      return { core, reminder: compiled.reminder, pluginDir: writePluginDir(join(d.root, 'run'), a.id, compiled.skills), compiled }
    },

    /** Called at each prompt (Claude's hook): the rule reminder, the library items the prompt points at, and now and then the whole catalog. */
    remind(agentId: string, prompt: string): string {
      const st = state.get(agentId)
      if (!st) return ''
      st.turn++
      const parts = st.reminder ? [st.reminder] : []
      const entries = indexSync(agentId)
      const onDemand = entries.filter((e) => e.mode === 'on-demand')
      const items = itemsMap()
      for (const m of matchItems(prompt, onDemand, MATCHES)) {
        // How to get it. Claude: the office's tool (allowed without a prompt), else the skill by name. Others: the skill's file by its path, which the library folder being in their workspace allows without a prompt (a tool of the office would ask each time).
        const it = items.get(m.id)
        const file = it?.kind === 'skill' && it.dir ? join(it.dir, 'SKILL.md') : ''
        const tool = `Read it with library_get('${m.id}')`
        const way = st.native ? (st.canFetch ? tool : `Use the ${m.id} skill`) : file ? `Read ${file}` : st.canFetch ? tool : `Ask for ${m.id}`
        const line = `Library: this task matches ${m.id} (${m.description.slice(0, 100)}). ${way} before you start.`
        record(agentId, m.id, 'triggered', m.mode, line)
        parts.push(line)
      }
      if (onDemand.length && (st.catalogDue || st.turn % CATALOG_EVERY === 0)) {
        st.catalogDue = false
        parts.push(buildCatalog(entries))
      }
      return parts.join('\n')
    },

    /** The agent lost its earlier context (compaction): show it the catalog again at its next prompt. */
    refresh(agentId: string) {
      const st = state.get(agentId)
      if (st) st.catalogDue = true
    },

    /** An agent used a library item without going through the tools (Claude's own Skill tool, or reading its file). */
    record,

    async get(agentId: string, id: string, file?: string): Promise<string> {
      const a = agentOrThrow(agentId)
      const allowed = (await index(agentId)).some((e) => e.id === id)
      const item = allowed ? await library.get(id) : null
      if (!item) throw notAllowed(id)
      let text: string
      if (file) {
        if (item.kind !== 'skill') throw new Error(`${id} has no files.`)
        let full = resolve(item.dir, file)
        try {
          // The real path, so a link inside the skill cannot lead out of it.
          full = realpathSync(full)
        } catch {
          throw new Error(`${file} is not a file of ${id}.`)
        }
        const rel = relative(realpathSync(item.dir), full)
        if (!rel || rel.startsWith('..') || isAbsolute(rel) || rel.split(/[\\/]/).some((p) => p.startsWith('.')) || !lstatSync(full).isFile()) throw new Error(`${file} is not a file of ${id}.`)
        try {
          if (statSync(full).size > MAX_FILE) throw new Error(`${file} is too large to read here; open it by its path: ${full}`)
          text = readFileSync(full, 'utf8')
        } catch (err) {
          throw err instanceof Error && err.message.includes('too large') ? err : new Error(`${file} is not a file of ${id}.`)
        }
      } else {
        const files = item.files.map((f) => `- ${join(item.dir, f)}`)
        text = `# ${item.name}\n\n${item.body}${files.length ? `\n\nFiles of this skill (read or run them by these absolute paths, or ask for one with library_get(id, file)):\n${files.join('\n')}` : ''}`
      }
      record(agentId, id, 'fetched')
      return text
    },

    async search(agentId: string, query: string): Promise<IndexEntry[]> {
      const words = query.toLowerCase().split(/\s+/).filter(Boolean)
      return (await index(agentId)).filter((e) => words.every((w) => `${e.id} ${e.name} ${e.description} ${e.when}`.toLowerCase().includes(w)))
    },

    /** Which on-demand items a message would point an agent of this workspace at, best first (the playbook's "Try a message"). */
    async tryMessage(repoPath: string, text: string): Promise<{ id: string; name: string; score: number }[]> {
      return matchItems(text, entriesFor(repoPath).filter((e) => e.mode === 'on-demand'), MATCHES).map((m) => ({ id: m.id, name: m.name, score: m.score }))
    },

    /** The agents of a workspace that started before its playbook, or the global one, last changed: they keep what they were told until they restart. */
    staleAgents(repoPath: string): { id: string; name: string }[] {
      // A file's time has fractions of a millisecond and the log's does not: compare whole milliseconds, or an agent started in the same one looks stale.
      const changed = Math.floor(Math.max(playbooks.changedAt('global'), playbooks.changedAt({ workspace: d.workspaceKey(repoPath) })))
      const startedAt = new Map<string, number>()
      for (const u of log.all()) if (u.how === 'started' && u.workspace === d.workspaceKey(repoPath)) startedAt.set(u.agent, u.t)
      return [...startedAt].filter(([id, t]) => t < changed && d.agent(id)).map(([id]) => ({ id, name: d.agent(id)!.name }))
    },

    /** What the log holds for one agent, oldest first (the chat and the agent's tab show it). */
    usesOf(agentId: string): Use[] {
      return log.all().filter((u) => u.agent === agentId)
    },

    /** How often each item was used, by program (what the Library pane shows beside an item). */
    async usage(): Promise<Record<string, { claude: number; agy: number; total: number }>> {
      return Object.fromEntries(summarize(log.all()).top.map((i) => [i.id, { claude: i.byProvider.claude?.used ?? 0, agy: i.byProvider.agy?.used ?? 0, total: i.used }]))
    },

    /** What the log says: per item, per program and per agent, how often it was delivered, triggered and used. */
    stats(): Summary {
      return summarize(log.all())
    }
  }
}

export type LibraryService = ReturnType<typeof createLibraryService>
