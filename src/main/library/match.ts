/** Which library items a prompt is about: word overlap weighted by how rare each word is in the catalog. It nudges, so a miss is cheap. */
export interface Matchable {
  id: string
  name: string
  description: string
  when: string
}

const STOP = new Set('the and for with that this from into when then than are was were has have any all use using used can will should would could your you its not but out about over how what why who which where while also more some such only each per via'.split(' '))

const words = (s: string): string[] =>
  (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.replace(/(ing|ed|es|s)$/, ''))

/** A word's weight runs 0..1 (1: only one item uses it), so the bar means the same for 3 items or 300. A name word counts double. One rare word in an item's text passes; one common word does not. */
export const MIN_SCORE = 0.9

export function matchItems<T extends Matchable>(prompt: string, entries: T[], k = 3): (T & { score: number })[] {
  const p = new Set(words(prompt))
  if (!p.size) return []
  const docs = entries.map((x) => ({ x, name: new Set(words(`${x.id.replace(/-/g, ' ')} ${x.name}`)), rest: new Set(words(`${x.description} ${x.when}`)) }))
  const df = new Map<string, number>()
  for (const d of docs) for (const w of new Set([...d.name, ...d.rest])) df.set(w, (df.get(w) ?? 0) + 1)
  const idf = (w: string) => Math.log(1 + entries.length / (df.get(w) ?? 1)) / Math.log(1 + entries.length)
  return docs
    .map((d) => {
      let score = 0
      for (const w of p) if (d.name.has(w)) score += 2 * idf(w)
      else if (d.rest.has(w)) score += idf(w)
      return { ...d.x, score }
    })
    .filter((r) => r.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
}
