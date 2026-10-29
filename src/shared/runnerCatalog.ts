import type { CatalogModel } from './runnerPick'
import { isProviderId } from './types'

/**
 * Models the runner pick may choose, scored from the vendors' own benchmark numbers (docs/research/model-choice-and-limits.md, 5.1 and 5.2, fetched 2026-10-29).
 * Cost is the relative price of an agent turn that is mostly cache reads. Gemini 3.8 Flash costs 0.72 from 2027-01-01. A model with no score is not listed:
 * add it in `models.json` in the app's home folder and it stays out of the pick until it has a score and n.
 * Left out for want of a published agy id: Gemini 4 Argon, and the 5.5 Claude models on agy.
 */
export const DEFAULT_CATALOG: CatalogModel[] = [
  { model: 'claude-haiku-5-5', alias: 'haiku', program: 'claude', cost: 0.05, score: 0.704, n: 2 },
  { model: 'claude-sonnet-5-5', alias: 'sonnet', program: 'claude', cost: 0.88, score: 0.979, n: 2 },
  { model: 'claude-opus-5-5', alias: 'opus', program: 'claude', cost: 1.76, score: 0.964, n: 3 },
  { model: 'claude-fable-5-1', alias: 'fable', program: 'claude', cost: 4.2, score: 0.86, n: 3 },
  { model: 'gemini-3.8-flash-low', program: 'agy', cost: 0.36, score: 0.608, n: 2 }
]

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

/** A hand-edited file may hold anything; only entries with a model, a known program and a price survive. */
export function cleanCatalog(raw: unknown): CatalogModel[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((r): CatalogModel[] => {
    const o = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>
    const cost = num(o.cost)
    if (typeof o.model !== 'string' || !o.model || !isProviderId(o.program) || cost === undefined || cost < 0) return []
    const score = num(o.score)
    return [{ model: o.model, program: o.program, cost, ...(score !== undefined && { score, n: num(o.n) ?? 1 }), ...(num(o.retiresOn) !== undefined && { retiresOn: num(o.retiresOn) }), ...(typeof o.alias === 'string' && { alias: o.alias }) }]
  })
}

/** The built-in models, with the user's entries replacing any of the same model and adding the rest. */
export function mergeCatalog(own: CatalogModel[]): CatalogModel[] {
  const mine = new Map(own.map((m) => [m.model, m]))
  return [...DEFAULT_CATALOG.map((m) => mine.get(m.model) ?? m), ...own.filter((m) => !DEFAULT_CATALOG.some((d) => d.model === m.model))]
}
