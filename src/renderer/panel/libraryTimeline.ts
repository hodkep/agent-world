import type { Use } from '../../shared/library'

export interface Step {
  t: number
  tone: 'told' | 'point' | 'read' | 'mute'
  title: string
  note: string
}

const USED = new Set(['fetched', 'skill', 'read'])
const secs = (ms: number) => (ms < 950 ? 'at once' : ms < 60_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms / 60_000)} min`)

/** What the library did for one agent, as a story in order. `name` turns an item's id into its name. */
export function timeline(uses: Use[], name: (id: string) => string): Step[] {
  const sorted = [...uses].sort((a, b) => a.t - b.t)
  const out: Step[] = []
  const pointed = new Map<string, number>()
  for (const x of sorted) {
    if (x.how === 'started') {
      const told = sorted.filter((d) => d.how === 'delivered' && d.launch === x.launch).map((d) => name(d.id))
      out.push({ t: x.t, tone: 'told', title: told.length ? `Told ${told.join(' and ')}` : 'Started', note: `every time · about ${Math.max(1, Math.ceil((x.words ?? '').length / 4))} tokens` })
    } else if (x.how === 'triggered') {
      const last = pointed.get(x.id)
      if (last !== undefined && !sorted.some((r) => r.id === x.id && USED.has(r.how) && r.t > last && r.t <= x.t)) continue
      pointed.set(x.id, x.t)
      const read = sorted.find((r) => r.id === x.id && USED.has(r.how) && r.t >= x.t)
      out.push({ t: x.t, tone: read ? 'point' : 'mute', title: `Pointed at ${name(x.id)}`, note: read ? 'matched what you asked' : 'not read: the agent carried on without it' })
    } else if (USED.has(x.how)) {
      const at = pointed.get(x.id)
      out.push({ t: x.t, tone: 'read', title: `Read ${name(x.id)}`, note: at === undefined ? 'when the work needed it' : `${secs(x.t - at)} after it was pointed out` })
      pointed.delete(x.id)
    }
  }
  return out
}

/** One line's worth: how many items were told every time, pointed at, and read of those pointed at. */
export function summaryOf(uses: Use[]): { told: number; pointed: number; read: number } {
  const told = new Set(uses.filter((x) => x.how === 'delivered').map((x) => x.id))
  const pointed = new Set(uses.filter((x) => x.how === 'triggered').map((x) => x.id))
  const read = [...pointed].filter((id) => uses.some((x) => x.id === id && USED.has(x.how)))
  return { told: told.size, pointed: pointed.size, read: read.length }
}
