/** A page opened in the Preview, kept so it can be picked again instead of typed. */
export interface Visit {
  url: string
  title: string
  at: number
}
export const MAX_VISITS = 50

const bare = (url: string) => url.replace(/^https?:\/\//, '').replace(/#.*$/, '')
const same = (a: string, b: string) => bare(a).replace(/\/$/, '') === bare(b).replace(/\/$/, '')

/** The visit goes to the front; the same page is never listed twice (a title already known is kept if this visit has none). */
export function addVisit(list: Visit[], visit: Visit): Visit[] {
  const url = visit.url.replace(/#.*$/, '')
  const old = list.find((x) => same(x.url, url))
  return [{ url, title: visit.title || old?.title || '', at: visit.at }, ...list.filter((x) => !same(x.url, url))].slice(0, MAX_VISITS)
}

export const forget = (list: Visit[], url: string) => list.filter((x) => x.url !== url)

/** What was typed, read as an address: a bare port means localhost, and the scheme is not part of what is matched. */
export const typed = (value: string) => {
  const v = value.trim()
  return /^\d{2,5}([/?#].*)?$/.test(v) ? `localhost:${v}` : v.replace(/^https?:\/\//, '')
}

export interface Suggestion extends Visit {
  live: boolean
}

/** Servers running now first, then pages opened before; both narrowed by whatever part of the address or title was typed. */
export function suggest(history: Visit[], live: { url: string; title: string }[], value: string): { live: Suggestion[]; recent: Suggestion[] } {
  const q = typed(value).toLowerCase()
  const fits = (x: { url: string; title: string }) => !q || bare(x.url).toLowerCase().includes(q) || x.title.toLowerCase().includes(q)
  const now = live.filter(fits).map((x) => ({ url: x.url, title: history.find((h) => same(h.url, x.url))?.title || x.title, at: Date.now(), live: true }))
  const recent = history.filter((x) => fits(x) && !live.some((l) => same(l.url, x.url))).map((x) => ({ ...x, live: false }))
  return { live: now, recent }
}

/** The part of the best match still to be typed, shown as grey text; nothing when it does not start with what was typed. */
export function completion(value: string, top: string | undefined): string {
  const q = typed(value)
  if (!q || !top) return ''
  const t = bare(top)
  return t.toLowerCase().startsWith(q.toLowerCase()) && t.length > q.length ? t.slice(q.length) : ''
}

export function ago(at: number, now: number): string {
  const min = Math.floor((now - at) / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.floor(h / 24)
  return d === 1 ? 'yesterday' : `${d} days ago`
}
