import { acctKey, dateKey, dayStart, whoMap, type LedgerEvent } from './ledger'
import { tokenTotal } from './tokens'

export type GroupBy = 'provider' | 'account' | 'agent' | 'project' | 'model'

/** Tokens of one group. `cacheRead` and `cacheWrite` are null when no program in it ever reported them, which is not the same as 0. */
export interface MixRow {
  key: string
  /** What to call it where the key is not readable (an agent's name); the window names accounts and programs itself. */
  name: string
  provider: string
  account: string
  input: number
  cacheRead: number | null
  cacheWrite: number | null
  output: number
  /** Input and output from before requests were counted exactly, with no split of their own: on top of the four above. */
  legacy: number
  /** Dollars the programs reported for the same group. */
  usd: number
  /** The part of what exact requests read that came from the cache (0 to 1); null when none did say. */
  share: number | null
}

export interface TokenMix {
  total: MixRow
  groups: Record<GroupBy, MixRow[]>
}

const GROUPS: GroupBy[] = ['provider', 'account', 'agent', 'project', 'model']
const blank = (key: string, name: string, provider: string, account: string): MixRow => ({ key, name, provider, account, input: 0, cacheRead: null, cacheWrite: null, output: 0, legacy: 0, usd: 0, share: null })
const plus = (a: number | null, b: number | undefined) => (b === undefined ? a : (a ?? 0) + b)
export const mixSize = (r: MixRow) => r.input + (r.cacheRead ?? 0) + (r.cacheWrite ?? 0) + r.output + r.legacy

/** Where every token of the last `days` days went (today last), by program, account, agent, project and model; of one account (see `acctKey`) when `onlyAccount` is given. */
export function tokenMix(events: LedgerEvent[], days: number, now: number, names: Record<string, string> = {}, onlyAccount?: string): TokenMix {
  const today = new Date(dayStart(now))
  const first = dateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1)).getTime())
  const last = dateKey(now)
  const whoOf = whoMap(events, names)
  const maps = Object.fromEntries(GROUPS.map((g) => [g, new Map<string, MixRow>()])) as Record<GroupBy, Map<string, MixRow>>
  const total = blank('', '', '', '')
  // Exact requests only, per row, for the cache share.
  const exact = new Map<MixRow, number>()
  for (const e of events) {
    if (e.k !== 'req' && e.k !== 'tokens' && e.k !== 'cost') continue
    const day = dateKey(e.t)
    if (day < first || day > last) continue
    const w = whoOf(e)
    const keys: Record<GroupBy, string> = { provider: w.provider, account: acctKey(w.provider, w.account), agent: e.agent, project: e.project, model: e.model }
    if (onlyAccount !== undefined && keys.account !== onlyAccount) continue
    const names2: Record<GroupBy, string> = { provider: w.provider, account: w.account, agent: w.name, project: e.project, model: e.model }
    for (const row of [total, ...GROUPS.map((g) => maps[g].get(keys[g]) ?? maps[g].set(keys[g], blank(keys[g], names2[g], w.provider, w.account)).get(keys[g])!)]) {
      if (e.k === 'cost') row.usd += e.usd
      else if (e.k === 'tokens') row.legacy += e.input + e.output
      else {
        row.input += e.input
        row.output += e.output
        row.cacheRead = plus(row.cacheRead, e.cacheRead)
        row.cacheWrite = plus(row.cacheWrite, e.cacheWrite)
        exact.set(row, (exact.get(row) ?? 0) + tokenTotal({ ...e, output: 0 }))
      }
    }
  }
  const finish = (r: MixRow) => {
    const read = exact.get(r)
    r.share = read && r.cacheRead !== null ? r.cacheRead / read : null
    return r
  }
  const out = Object.fromEntries(GROUPS.map((g) => [g, [...maps[g].values()].map(finish).sort((a, b) => mixSize(b) - mixSize(a))])) as Record<GroupBy, MixRow[]>
  return { total: finish(total), groups: out }
}
