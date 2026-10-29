import type { CatalogModel } from './runnerPick'

export type Outcome = 'accepted' | 'rejected' | 'stopped'
/** One finished delegated run: the model that did it, and what its caller made of the work (stopping it counts against the model). */
export interface RunRecord {
  t: number
  model: string
  outcome: Outcome
}

/** The benchmark score counts as this many runs; a model without one needs this many rated runs before its pass rate is used alone. */
const PRIOR = 10
const EARN = 5

/** The file the runs are kept in holds one JSON record per line; a line that is not one is skipped. */
export function cleanRuns(text: string): RunRecord[] {
  return text.split('\n').flatMap((line): RunRecord[] => {
    try {
      const r = JSON.parse(line) as Partial<RunRecord>
      return typeof r.model === 'string' && Number.isFinite(r.t) && (r.outcome === 'accepted' || r.outcome === 'rejected' || r.outcome === 'stopped') ? [{ t: r.t!, model: r.model, outcome: r.outcome }] : []
    } catch {
      return []
    }
  })
}

export type Scored = CatalogModel & { benchmark?: number; rated: number; accepted: number }

/** Each model's score once its rated runs are added to its benchmark score (a short history moves it little, a long one decides it). */
export function blendCatalog(catalog: CatalogModel[], runs: RunRecord[]): Scored[] {
  return catalog.map((m) => {
    const mine = runs.filter((r) => r.model === m.model || r.model === m.alias)
    const accepted = mine.filter((r) => r.outcome === 'accepted').length
    const rated = mine.length
    const rate = rated ? accepted / rated : 0
    const base = { ...m, benchmark: m.score, rated, accepted }
    if (m.score !== undefined) return { ...base, score: (m.score * PRIOR + rate * rated) / (PRIOR + rated) }
    return rated >= EARN ? { ...base, score: rate, n: 1 } : base
  })
}
