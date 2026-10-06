/**
 * What a program that reports tokens but no price would have cost, from public per-million-token rates. These are estimates,
 * shown with a "~" and never mixed into a program's own reported dollars. A model with no rate here is left unpriced (its tokens
 * still count); rates can be added or changed in `prices.json` in the app's home folder, as { "model name": { "in": 3, "out": 15 } }.
 */
export interface Rate {
  /** US dollars per million tokens read, and per million written. */
  in: number
  out: number
}

/** "Claude Sonnet 4.6 (Thinking)" and "claude-sonnet-4-6" both become "claudesonnet46", so a name matches however a program spells it. */
export const normalizeModel = (name: string) => name.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '')

// Only rates that are public and known are listed; the rest are for the user to fill in.
export const DEFAULT_RATES: Record<string, Rate> = {
  claudesonnet46: { in: 3, out: 15 },
  claudeopus46: { in: 5, out: 25 }
}

/** The rate for a model: the user's own entry first, then the built-in one; the longest matching name wins. */
export function rateFor(model: string, own: Record<string, Rate> = {}): Rate | null {
  const m = normalizeModel(model)
  const book = { ...DEFAULT_RATES, ...Object.fromEntries(Object.entries(own).map(([k, v]) => [normalizeModel(k), v])) }
  const hit = Object.keys(book).filter((k) => k && m.includes(k)).sort((a, b) => b.length - a.length)[0]
  return hit ? book[hit]! : null
}

/** Dollars for a number of tokens read and written, or null when the model has no rate. */
export function estimateUsd(model: string, input: number, output: number, own: Record<string, Rate> = {}): number | null {
  const r = rateFor(model, own)
  return r ? (input * r.in + output * r.out) / 1_000_000 : null
}

/** A hand-edited file may hold anything; only well-formed rates survive. */
export function cleanRates(raw: unknown): Record<string, Rate> {
  const out: Record<string, Rate> = {}
  if (raw && typeof raw === 'object')
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
      if (typeof o.in === 'number' && typeof o.out === 'number' && o.in >= 0 && o.out >= 0 && Number.isFinite(o.in + o.out)) out[k] = { in: o.in, out: o.out }
    }
  return out
}
