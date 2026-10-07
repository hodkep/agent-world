import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'

/** delivered: put in front of the agent at launch · triggered: the prompt matched the item's rule · fetched/skill/read: the agent used it. */
export type How = 'delivered' | 'triggered' | 'fetched' | 'skill' | 'read'

export interface Use {
  t: number
  agent: string
  name: string
  provider: string
  workspace: string
  id: string
  how: How
  mode?: string
  /** The agent's own prompt count when it happened, to tell whether a trigger was answered in the same turn. */
  turn?: number
  /** When the agent was launched: turn counts start again at each launch, so a turn is told apart by (launch, turn). */
  launch?: number
}

export class UseLog {
  constructor(private file: string) {}

  add(u: Omit<Use, 't'>): void {
    mkdirSync(dirname(this.file), { recursive: true })
    appendFileSync(this.file, JSON.stringify({ t: Date.now(), ...u }) + '\n')
  }

  all(): Use[] {
    let text = ''
    try {
      text = readFileSync(this.file, 'utf8')
    } catch {
      return []
    }
    const out: Use[] = []
    for (const line of text.split('\n')) {
      try {
        out.push(JSON.parse(line) as Use)
      } catch {
        /* a half-written last line */
      }
    }
    return out
  }
}

export interface Tally {
  delivered: number
  triggered: number
  answered: number
  used: number
}
export interface ItemStats extends Tally {
  id: string
  byProvider: Record<string, Tally>
}
export interface Summary {
  items: Record<string, ItemStats>
  agents: Record<string, Tally & { name: string; provider: string }>
  /** Items that were used, most used first. */
  top: ItemStats[]
}

const zero = (): Tally => ({ delivered: 0, triggered: 0, answered: 0, used: 0 })

export function summarize(uses: Use[]): Summary {
  const items: Summary['items'] = {}
  const agents: Summary['agents'] = {}
  const usedAt = new Set(uses.filter((u) => u.how === 'fetched' || u.how === 'skill' || u.how === 'read').map((u) => `${u.agent}|${u.launch}|${u.id}|${u.turn}`))
  const bump = (u: Use, f: (t: Tally) => void) => {
    const i = (items[u.id] ??= { id: u.id, ...zero(), byProvider: {} })
    f(i)
    f((i.byProvider[u.provider] ??= zero()))
    f((agents[u.agent] ??= { ...zero(), name: u.name, provider: u.provider }))
  }
  for (const u of uses) {
    if (u.how === 'delivered') bump(u, (t) => t.delivered++)
    else if (u.how === 'triggered') bump(u, (t) => (t.triggered++, usedAt.has(`${u.agent}|${u.launch}|${u.id}|${u.turn}`) && t.answered++))
    else bump(u, (t) => t.used++)
  }
  const top = Object.values(items).filter((i) => i.used > 0).sort((a, b) => b.used - a.used || a.id.localeCompare(b.id))
  return { items, agents, top }
}
