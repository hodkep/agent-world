/** Which library items a prompt is about: word overlap weighted by how rare each word is in the catalog. It nudges, so a miss is cheap. */
export interface Matchable {
  id: string
  name: string
  description: string
  when: string
}

const STOP = new Set('the and for with that this from into when then than are was were has have any all use using used can will should would could your you its not but out about over how what why who which where while also more some such only each per via new old make get want need just like please help do does did our out one two now here there their them they these those been being into onto upon very much many'.split(' '))

const words = (s: string): string[] =>
  (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.replace(/(ing|ed|es|s)$/, ''))

/** A word's weight runs 0..1 (1: only one item uses it), so the bar means the same for 3 items or 300. A name word counts double. */
export const MIN_SCORE = 0.9
/** One word in common is not a need ("merge", "review" and "feature" are in half of what people say), so an item needs two different words of the prompt. */
export const MIN_WORDS = 2

export function matchItems<T extends Matchable>(prompt: string, entries: T[], k = 3): (T & { score: number })[] {
  const p = new Set(words(prompt))
  if (!p.size) return []
  const docs = entries.map((x) => ({
    x,
    name: new Set(words(`${x.id.replace(/-/g, ' ')} ${x.name}`)),
    // When the item says when it applies, that is what is matched; its description (written to explain, so full of everyday words) only when it does not.
    rest: new Set(words(x.when.trim() ? x.when : x.description))
  }))
  const df = new Map<string, number>()
  for (const d of docs) for (const w of new Set([...d.name, ...d.rest])) df.set(w, (df.get(w) ?? 0) + 1)
  const idf = (w: string) => Math.log(1 + entries.length / (df.get(w) ?? 1)) / Math.log(1 + entries.length)
  const scored: { hit: T & { score: number }; words: number }[] = []
  for (const d of docs) {
    let score = 0
    let n = 0
    for (const w of p) {
      if (d.name.has(w)) score += 2 * idf(w)
      else if (d.rest.has(w)) score += idf(w)
      else continue
      n++
    }
    if (score >= MIN_SCORE && n >= MIN_WORDS) scored.push({ hit: { ...d.x, score }, words: n })
  }
  return scored.sort((a, b) => b.hit.score - a.hit.score).slice(0, k).map((r) => r.hit)
}
