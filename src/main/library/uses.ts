import { appendFileSync, closeSync, mkdirSync, openSync, readSync, statSync } from 'node:fs'
import { dirname } from 'node:path'

import type { ItemStats, SkillUse, Summary, Tally, Use } from '../../shared/library'
export type { How, ItemStats, SkillUse, Summary, Tally, Use } from '../../shared/library'

export class UseLog {
  constructor(private file: string) {}

  /** What has been read of the file so far: the uses, and how many bytes (up to the last whole line) they came from. */
  private seen: { size: number; offset: number; uses: Use[] } = { size: -1, offset: 0, uses: [] }

  add(u: Omit<Use, 't'>): void {
    mkdirSync(dirname(this.file), { recursive: true })
    appendFileSync(this.file, JSON.stringify({ t: Date.now(), ...u }) + '\n')
  }

  /**
   * Every use, oldest first. The file is megabytes and every chat and every screen asks for it: it is read once, and afterwards only what was added to it
   * (by this app or another copy of it) is read. The same list comes back while the file is the same, so nobody may change it.
   */
  all(): Use[] {
    let size: number
    try {
      size = statSync(this.file).size
    } catch {
      this.seen = { size: -1, offset: 0, uses: [] }
      return this.seen.uses
    }
    if (size === this.seen.size) return this.seen.uses
    // A file that got shorter was replaced: start over.
    const from = size < this.seen.offset ? 0 : this.seen.offset
    const base = from === 0 ? [] : this.seen.uses
    let text = ''
    try {
      const fd = openSync(this.file, 'r')
      try {
        const buf = Buffer.alloc(size - from)
        readSync(fd, buf, 0, buf.length, from)
        text = buf.toString('utf8')
      } finally {
        closeSync(fd)
      }
    } catch {
      return this.seen.uses
    }
    // A last line without its newline is still being written: it is read when it is finished.
    const end = text.lastIndexOf('\n') + 1
    const added: Use[] = []
    for (const line of text.slice(0, end).split('\n')) {
      if (!line) continue
      try {
        added.push(JSON.parse(line) as Use)
      } catch {
        /* a damaged line */
      }
    }
    this.seen = { size, offset: from + Buffer.byteLength(text.slice(0, end)), uses: added.length || from === 0 ? [...base, ...added] : base }
    return this.seen.uses
  }
}

const zero = (): Tally => ({ delivered: 0, triggered: 0, answered: 0, used: 0, declined: 0, related: 0, relatedAnswered: 0 })

export function summarize(uses: Use[]): Summary {
  const items: Summary['items'] = {}
  const agents: Summary['agents'] = {}
  // The turns an agent read an item in, per launch.
  const readAt = new Map<string, number[]>()
  for (const u of uses) if ((u.how === 'fetched' || u.how === 'skill' || u.how === 'read') && u.turn !== undefined) readAt.set(`${u.agent}|${u.launch}|${u.id}`, [...(readAt.get(`${u.agent}|${u.launch}|${u.id}`) ?? []), u.turn])
  // Read in that turn or any later turn of the same launch: an agent reads a rule when it gets to the work, not always at once.
  const answered = (u: Use) => readAt.get(`${u.agent}|${u.launch}|${u.id}`)?.some((t) => u.turn !== undefined && t >= u.turn) ?? false
  const bump = (u: Use, f: (t: Tally) => void) => {
    const i = (items[u.id] ??= { id: u.id, ...zero(), reasons: [], byProvider: {} })
    f(i)
    f((i.byProvider[u.provider] ??= zero()))
    f((agents[u.agent] ??= { ...zero(), name: u.name, provider: u.provider }))
  }
  for (const u of uses) {
    if (u.how === 'delivered') bump(u, (t) => t.delivered++)
    else if (u.how === 'triggered') {
      const read = answered(u)
      bump(u, (t) => {
        t.triggered++
        if (read) t.answered++
        if (u.related) (t.related++, read && t.relatedAnswered++)
      })
    }
    else if (u.how === 'fetched' || u.how === 'skill' || u.how === 'read') bump(u, (t) => t.used++)
    else if (u.how === 'skipped') {
      bump(u, (t) => t.declined++)
      if (u.reason) items[u.id]!.reasons.push(u.reason)
    }
  }
  const top = Object.values(items).filter((i) => i.used > 0).sort((a, b) => b.used - a.used || a.id.localeCompare(b.id))
  return { items, agents, top }
}

/** Per item: in how many agent turns it was loaded or read in the last `days` days, when it last was (at any time), and which agents and accounts used it then. */
export function skillUsage(uses: Use[], now: number, days = 30): Record<string, SkillUse> {
  const since = now - days * 86_400_000
  const out: Record<string, SkillUse> = {}
  // One use per agent turn: loading a skill and reading three of its files in the same turn is one use of it.
  const seen = new Set<string>()
  for (const u of uses) {
    if (u.how !== 'fetched' && u.how !== 'skill' && u.how !== 'read') continue
    if (u.turn !== undefined) {
      const key = `${u.agent}|${u.launch ?? ''}|${u.turn}|${u.id}`
      if (seen.has(key)) continue
      seen.add(key)
    }
    const s = (out[u.id] ??= { used: 0, last: 0, agents: [], accounts: [], days: Array<number>(days).fill(0), who: [], projects: {} })
    s.last = Math.max(s.last, u.t)
    if (u.t < since) continue
    s.used++
    s.days[Math.max(0, days - 1 - Math.floor((now - u.t) / 86_400_000))]!++
    if (!s.agents.includes(u.name)) s.agents.push(u.name)
    if (!s.who.some((w) => w.id === u.agent)) s.who.push({ id: u.agent, name: u.name })
    s.projects[u.workspace] = (s.projects[u.workspace] ?? 0) + 1
    if (u.account && !s.accounts.includes(u.account)) s.accounts.push(u.account)
  }
  for (const s of Object.values(out)) (s.agents.sort(), s.accounts.sort(), s.who.sort((a, b) => a.name.localeCompare(b.name)))
  return out
}
