import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'

import type { ItemStats, Summary, Tally, Use } from '../../shared/library'
export type { How, ItemStats, Summary, Tally, Use } from '../../shared/library'

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

/** An item pointed at counts as read when the agent reads it in that turn or within this many after: it reads when it gets to the work, not always at once. */
const ANSWER_TURNS = 3

const zero = (): Tally => ({ delivered: 0, triggered: 0, answered: 0, used: 0 })

export function summarize(uses: Use[]): Summary {
  const items: Summary['items'] = {}
  const agents: Summary['agents'] = {}
  // The turns an agent read an item in, per launch.
  const readAt = new Map<string, number[]>()
  for (const u of uses) if ((u.how === 'fetched' || u.how === 'skill' || u.how === 'read') && u.turn !== undefined) readAt.set(`${u.agent}|${u.launch}|${u.id}`, [...(readAt.get(`${u.agent}|${u.launch}|${u.id}`) ?? []), u.turn])
  const answered = (u: Use) => readAt.get(`${u.agent}|${u.launch}|${u.id}`)?.some((t) => u.turn !== undefined && t >= u.turn && t <= u.turn + ANSWER_TURNS) ?? false
  const bump = (u: Use, f: (t: Tally) => void) => {
    const i = (items[u.id] ??= { id: u.id, ...zero(), byProvider: {} })
    f(i)
    f((i.byProvider[u.provider] ??= zero()))
    f((agents[u.agent] ??= { ...zero(), name: u.name, provider: u.provider }))
  }
  for (const u of uses) {
    if (u.how === 'delivered') bump(u, (t) => t.delivered++)
    else if (u.how === 'triggered') bump(u, (t) => (t.triggered++, answered(u) && t.answered++))
    else if (u.how === 'fetched' || u.how === 'skill' || u.how === 'read') bump(u, (t) => t.used++)
  }
  const top = Object.values(items).filter((i) => i.used > 0).sort((a, b) => b.used - a.used || a.id.localeCompare(b.id))
  return { items, agents, top }
}
