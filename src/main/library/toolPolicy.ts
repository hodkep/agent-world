import { appendFileSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { OFFICE_SERVER, type Policies, type Policy, type ToolCallNote } from '../../shared/mcp'

const SERVER = /^[\w.-]+$/
const TOOL = /^[A-Za-z][\w.-]*$/
const POLICIES: Policy[] = ['allow', 'ask', 'deny']

export interface ToolSettings {
  /** Servers turned off for the agents the app runs, by name. */
  off: string[]
  /** What each tool is told; a tool with none is left to the agent's permission mode. */
  policy: Record<string, Policy>
}

/**
 * Which MCP servers are off for the agents the app runs, and what each tool is told (Allow, Ask or Deny). Kept in the app's own folder: the
 * programs' own files are never changed. A file written by hand or by another version is read only as far as its shape.
 */
export class ToolPolicy {
  private v: ToolSettings = { off: [], policy: {} }

  constructor(private file: string) {
    try {
      const raw = JSON.parse(readFileSync(file, 'utf8')) as { off?: unknown; policy?: unknown }
      if (Array.isArray(raw.off)) this.v.off = [...new Set(raw.off.filter((s): s is string => typeof s === 'string' && SERVER.test(s) && s !== OFFICE_SERVER))]
      if (raw.policy && typeof raw.policy === 'object') for (const [k, p] of Object.entries(raw.policy)) if (TOOL.test(k) && POLICIES.includes(p as Policy)) this.v.policy[k] = p as Policy
    } catch {
      // nothing kept yet, or unreadable: nothing is off and no tool has a policy
    }
  }

  get = (): ToolSettings => ({ off: [...this.v.off], policy: { ...this.v.policy } })
  /** The policies as the rules take them. */
  policies = (): Policies => ({ ...this.v.policy })

  setServer(name: string, on: boolean): void {
    if (name === OFFICE_SERVER) throw new Error('The office’s own server cannot be turned off: agents reach the office through it.')
    if (!SERVER.test(name)) throw new Error(`"${name}" is not a server name.`)
    this.v.off = on ? this.v.off.filter((s) => s !== name) : [...new Set([...this.v.off, name])]
    this.save()
  }

  setTool(tool: string, policy: Policy | null): void {
    if (!TOOL.test(tool)) throw new Error(`"${tool}" is not a tool name.`)
    if (policy !== null && !POLICIES.includes(policy)) throw new Error('A tool is told Allow, Ask or Deny.')
    if (policy === null) delete this.v.policy[tool]
    else this.v.policy[tool] = policy
    this.save()
  }

  private save() {
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify(this.v), { mode: 0o600 })
    renameSync(tmp, this.file)
  }
}

/** One line for each tool call, a name and a place and nothing of what was asked of the tool, so Usage can say what is used. */
export class ToolLog {
  /** What was read, and the size it was read at: the screens ask often and the file grows with every call. */
  private seen: { size: number; notes: ToolCallNote[] } = { size: -1, notes: [] }

  constructor(private file: string) {}

  add(n: Omit<ToolCallNote, 't'>): void {
    mkdirSync(dirname(this.file), { recursive: true })
    appendFileSync(this.file, JSON.stringify({ t: Date.now(), agent: n.agent, project: n.project, provider: n.provider, tool: n.tool }) + '\n', { mode: 0o600 })
  }

  all(): ToolCallNote[] {
    let size: number
    try {
      size = statSync(this.file).size
    } catch {
      return []
    }
    if (size === this.seen.size) return this.seen.notes
    let text = ''
    try {
      text = readFileSync(this.file, 'utf8')
    } catch {
      return []
    }
    const notes: ToolCallNote[] = []
    for (const line of text.split('\n')) {
      try {
        const n = JSON.parse(line) as ToolCallNote
        if (typeof n.tool === 'string' && Number.isFinite(n.t)) notes.push(n)
      } catch {
        /* a half-written or damaged line */
      }
    }
    this.seen = { size, notes }
    return notes
  }

  /** Drops what is older than the 30 days Usage shows, so the file does not grow for ever; says how many it dropped. Called once when the app starts. */
  prune(now: number): number {
    const all = this.all()
    const keep = all.filter((n) => n.t >= now - 30 * 86_400_000)
    if (keep.length === all.length) return 0
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, keep.map((n) => JSON.stringify(n)).join('\n') + (keep.length ? '\n' : ''), { mode: 0o600 })
    renameSync(tmp, this.file)
    this.seen = { size: -1, notes: [] }
    return all.length - keep.length
  }
}
