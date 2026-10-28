import { checkSeries, computeSeries, type Reading } from '../shared/readings'

const KEEP = 500

/** The readings of each agent (newest last), in memory: they start empty when the app does. ponytail: not saved; a ledger event per reading if a figure must survive a restart. */
export function createReadings() {
  const by = new Map<string, Reading[]>()
  return {
    add(agent: string, rs: Reading[]) {
      by.set(agent, [...(by.get(agent) ?? []), ...rs].slice(-KEEP))
    },
    forget: (agent: string) => void by.delete(agent),
    /** The figure for each series asked (checked again here: the window is not trusted), null where nothing reports it. */
    values(agent: string, raw: unknown, now: number): Record<string, number | null> {
      const { series, problems } = checkSeries(raw)
      if (problems.length) return {}
      return Object.fromEntries(series.map((s) => [s.id, computeSeries(by.get(agent) ?? [], s, now)]))
    }
  }
}
