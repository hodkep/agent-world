import type { LedgerEvent } from '../shared/ledger'
import type { UsageRecord } from '../shared/tokens'

const KEEP = 1000

/**
 * The ledger events for requests a provider's usage feed reported for one agent: one `req` per request not seen before (`seen` holds the ids),
 * and, for a program that reports no price, an estimated `cost` worked out from what it read (the cache included) and wrote.
 */
export function requestEvents(
  records: UsageRecord[],
  who: { agent: string; project: string; provider: string; name: string; account?: string },
  seen: Set<string>,
  estimate?: (model: string, input: number, output: number) => number | null
): LedgerEvent[] {
  const out: LedgerEvent[] = []
  for (const r of records) {
    if (seen.has(r.id)) continue
    seen.add(r.id)
    const { at, model, input, cacheRead, cacheWrite, output } = r
    out.push({ k: 'req', t: at, ...who, model, input, ...(cacheRead !== undefined && { cacheRead }), ...(cacheWrite !== undefined && { cacheWrite }), output })
    const usd = estimate?.(model, input + (cacheRead ?? 0), output)
    if (usd) out.push({ k: 'cost', t: at, agent: who.agent, project: who.project, provider: who.provider, name: who.name, ...(who.account && { account: who.account }), model, usd, est: true })
  }
  // Ids only have to outlast a repeat, so the oldest are dropped before the list grows without end.
  if (seen.size > 2 * KEEP) for (const id of [...seen].slice(0, seen.size - KEEP)) seen.delete(id)
  return out
}
