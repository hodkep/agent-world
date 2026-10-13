import { lstatSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, isAbsolute } from 'node:path'
import { Library, type Item } from './store'
import { Playbooks, compile, merge, type Compiled, type Rule } from './playbook'
import { writePluginDir } from './pluginDir'
import { buildCatalog } from './catalog'
import { UseLog, summarize, type How, type Summary, type Use } from './uses'

export interface AgentRef {
  id: string
  name: string
  repoPath: string
  provider: string
  /** Its program reports what it does by hooks that call the office (agy's plugin), so silence from them means they are not getting through. */
  viaHook?: boolean
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
  /** The skills named on the steps of the agent's open task's workflow: it may read them even when its playbook leaves them out. */
  grants?: (agentId: string) => string[]
  /** Called when an agent has a new entry in the log, so a screen showing it can refresh. */
  onUse?: (agentId: string, how: How, item: string) => void
  /** The clock (tests move it). */
  now?: () => number
}

const MAX_FILE = 100 * 1024

/** The library as agents use it: what each one is told when it starts, what it may ask for, and a record of what it fetched. */
export function createLibraryService(d: Deps) {
  const library = new Library(d.root)
  const playbooks = new Playbooks(d.root)
  const log = new UseLog(join(d.root, 'uses.jsonl'))
  // Per agent: how many prompts it has had, whether it can fetch, its rulebook lines, and whether the full catalog is due again; and the items it has read since it last lost its context.
  const state = new Map<string, { launch: number; turn: number; canFetch: boolean; native: boolean; reminder: string; hardIds: string[]; mediumIds: string[]; catalogDue: boolean; /** When the agent's last prompt came, to tell it is back after a long pause. */ lastAt: number; read: Set<string> }>()
  // When each agent's hook last called the office.
  const hookSeen = new Map<string, number>()
  const CATALOG_EVERY = 10
  // The rulebook line (every medium and hard rule) is sent with the first message, every few messages after, right after a compaction, and when the agent comes back after a long pause; a soft rule is only in the opening text and the catalog. Nothing reads the message: the agent decides what applies.
  const RULEBOOK_EVERY = 6
  const IDLE_MS = 60 * 60_000
  const now = d.now ?? Date.now

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

  function entriesFor(repoPath: string, granted: string[] = []): IndexEntry[] {
    const items = itemsMap()
    const order = { always: 0, 'on-demand': 1, step: 2, off: 3 }
    const entries = rulesFor(repoPath)
      .filter((r) => r.mode !== 'off' && items.has(r.id))
      .sort((x, y) => order[x.mode] - order[y.mode])
      .map((r) => {
        const i = items.get(r.id)!
        return { id: i.id, kind: i.kind, name: i.name, description: i.description, tokens: i.tokens.body, mode: r.mode, when: r.when }
      })
    // A step that names a skill lets the agent read it for the task, whatever its playbook says. Only skills that exist, once.
    for (const id of new Set(granted)) {
      const i = items.get(id)
      if (i?.kind === 'skill' && !entries.some((e) => e.id === id)) entries.push({ id: i.id, kind: i.kind, name: i.name, description: i.description, tokens: i.tokens.body, mode: 'step', when: 'for the step of your workflow that names it' })
    }
    return entries
  }

  const indexSync = (agentId: string) => entriesFor(agentOrThrow(agentId).repoPath, d.grants?.(agentId) ?? [])
  const index = async (agentId: string) => indexSync(agentId)

  function record(agentId: string, id: string, how: How, mode?: string, words?: string, reason?: string, because?: string) {
    const a = d.agent(agentId)
    if (!a) return
    // Hooks see every Skill call and Read; only the library's own items count.
    if ((how === 'skill' || how === 'read') && !itemsMap().has(id)) return
    log.add({ agent: a.id, name: a.name, provider: a.provider, workspace: d.workspaceKey(a.repoPath), id, how, mode, turn: state.get(agentId)?.turn, launch: state.get(agentId)?.launch, words, reason, because })
    if (how === 'fetched' || how === 'skill' || how === 'read') state.get(agentId)?.read.add(id)
    d.onUse?.(a.id, how, id)
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
      state.set(a.id, { launch: Date.now(), turn: 0, canFetch, native, reminder: compiled.reminder, hardIds: compiled.hardIds, mediumIds: compiled.mediumIds, catalogDue: false, lastAt: now(), read: new Set() })
      const entries = indexSync(a.id)
      const onDemand = entries.some((e) => e.mode === 'on-demand')
      // The catalog is a file so an agent that has lost track can read it again; the opening text says where.
      let core = compiled.core
      if (onDemand) {
        const file = join(d.root, 'catalog', `${d.workspaceKey(a.repoPath)}.md`)
        mkdirSync(dirname(file), { recursive: true })
        writeFileSync(file, buildCatalog(entries) + '\n')
        core += `${core ? '\n\n' : ''}If you cannot recall what the library holds, read ${file}. The rules above say when each applies: you decide which apply to your task, read the one that does before the work it covers, and say with library_skip when you pass one over.`
      }
      record(a.id, '', 'started', undefined, core)
      for (const e of entries) if (e.mode === 'always') record(a.id, e.id, 'delivered', e.mode)
      return { core, reminder: compiled.reminder, pluginDir: writePluginDir(join(d.root, 'run'), a.id, compiled.skills), compiled }
    },

    /** Called at each prompt (Claude's hook): the rulebook line when it is due (the first message, every few after, after a compaction, after a long pause), and now and then the whole catalog. The message itself is not read: the agent decides which rule applies. */
    remind(agentId: string, _prompt: string): string {
      const st = state.get(agentId)
      if (!st) return ''
      st.turn++
      const at = now()
      const due = st.turn % RULEBOOK_EVERY === 1 || st.catalogDue || at - st.lastAt > IDLE_MS
      st.lastAt = at
      const entries = indexSync(agentId)
      const parts = due && st.reminder ? [st.reminder] : []
      // A rule the agent has read is in its context until it loses it, so it is not logged as put in front of it again.
      if (due) for (const id of [...st.hardIds, ...st.mediumIds]) {
        const e = entries.find((x) => x.id === id)
        if (e && !st.read.has(id)) record(agentId, id, 'triggered', e.mode, `${id} (${e.when || 'when it applies'})`)
      }
      if (entries.some((e) => e.mode === 'on-demand') && (st.catalogDue || st.turn % CATALOG_EVERY === 0)) {
        st.catalogDue = false
        parts.push(buildCatalog(entries))
      }
      return parts.join('\n')
    },

    /** The agent says a library item it was pointed at does not apply; what it says is kept, so the playbook's wording can be tuned. */
    skip(agentId: string, id: string, reason: string): void {
      if (!indexSync(agentId).some((e) => e.id === id)) throw notAllowed(id)
      const why = reason.trim().slice(0, 200)
      if (!why) throw new Error('Say in a few words why it does not apply: a reason is needed.')
      record(agentId, id, 'skipped', undefined, undefined, why)
    },

    /** The agent lost its earlier context (compaction): show it the catalog again at its next prompt. */
    refresh(agentId: string) {
      const st = state.get(agentId)
      if (st) (st.catalogDue = true, st.read.clear())
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

    /** Every agent of a workspace that was given an opening text, with its program and whether that text is older than the playbook now: those keep what they were told until they restart. */
    holders(repoPath: string): { id: string; name: string; provider: string; stale: boolean }[] {
      // A file's time has fractions of a millisecond and the log's does not: compare whole milliseconds, or an agent started in the same one looks stale.
      const changed = Math.floor(Math.max(playbooks.changedAt('global'), playbooks.changedAt({ workspace: d.workspaceKey(repoPath) })))
      const startedAt = new Map<string, number>()
      for (const u of log.all()) if (u.how === 'started' && u.workspace === d.workspaceKey(repoPath)) startedAt.set(u.agent, u.t)
      return [...startedAt].filter(([id]) => d.agent(id)).map(([id, t]) => ({ id, name: d.agent(id)!.name, provider: d.agent(id)!.provider, stale: t < changed }))
    },

    /** An agent's own hook called the office (the program's plugin reached it). */
    hookCalled(agentId: string) {
      hookSeen.set(agentId, Date.now())
    },

    /** Agents that report by hooks, have worked since they started (`busyAt` says when each last did), and never once got a hook through. */
    silent(repoPath: string, busyAt: (agentId: string) => number): { id: string; name: string }[] {
      const GRACE = 5000
      const startedAt = new Map<string, number>()
      for (const u of log.all()) if (u.how === 'started' && u.workspace === d.workspaceKey(repoPath)) startedAt.set(u.agent, u.t)
      return [...startedAt]
        .filter(([id, t]) => d.agent(id)?.viaHook && busyAt(id) > t + GRACE && (hookSeen.get(id) ?? 0) < t)
        .map(([id]) => ({ id, name: d.agent(id)!.name }))
    },

    /** The agents of a workspace that started before its playbook last changed. */
    staleAgents(repoPath: string): { id: string; name: string }[] {
      return this.holders(repoPath).filter((h) => h.stale).map(({ id, name }) => ({ id, name }))
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
