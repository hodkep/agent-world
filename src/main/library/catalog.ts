import { tokens } from './doc'

export interface CatalogEntry {
  id: string
  description: string
  when: string
  mode: string
}

export const CATALOG_BUDGET = 400

/** The list an agent can re-read when it has lost track of what the library holds: one line per on-demand item, then bare ids once the budget is spent. */
export function buildCatalog(entries: CatalogEntry[], budget = CATALOG_BUDGET): string {
  const live = entries.filter((x) => x.mode === 'on-demand')
  const head = 'Library items and when each applies. Read one with library_get(id) before the task it covers.'
  const lines: string[] = []
  let used = tokens(head)
  let i = 0
  for (; i < live.length; i++) {
    const x = live[i]!
    const line = `- ${x.id}: ${(x.when || x.description).slice(0, 90)}`
    // keep room for the tail that names what was left out
    if (used + tokens(line) > budget - 40) break
    lines.push(line)
    used += tokens(line)
  }
  const rest = live.slice(i).map((x) => x.id)
  if (!rest.length) return [head, ...lines].join('\n')
  const shown: string[] = []
  for (const id of rest) {
    if (used + tokens(`More (ids only): ${[...shown, id].join(', ')}`) > budget - 15) break
    shown.push(id)
  }
  const left = rest.length - shown.length
  const tail = `More (ids only${left ? `; ${left} others via library_search` : ''}): ${shown.join(', ')}`
  return [head, ...lines, tail].join('\n')
}
