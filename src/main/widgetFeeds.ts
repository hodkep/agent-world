import type { FeedResult, FeedSpec } from '../shared/widgets'

const AT_ONCE = 2
const MAX_WAIT_MS = 10 * 60_000

interface Job {
  key: string
  spec: FeedSpec
  /** What it is told to be (address and rate): a change restarts it. */
  sig: string
  fails: number
  cancel: (() => void) | null
  stopped: boolean
}

/**
 * Loads the addresses the widgets on screen asked for, a few at a time and no faster than they asked, and hands each result on as it comes. It knows nothing of what a widget does with it.
 * A failing address is tried less and less often (up to every ten minutes) so a dead site is not hammered.
 */
export function createWidgetFeeds(o: {
  fetch: (url: string) => Promise<FeedResult>
  onUpdate: (key: string, feed: string, r: FeedResult) => void
  schedule?: (fn: () => void, ms: number) => () => void
  now?: () => number
}) {
  const schedule = o.schedule ?? ((fn, ms) => ((t) => () => clearTimeout(t))(setTimeout(fn, ms)))
  const jobs = new Map<string, Job>()
  const results: Record<string, Record<string, FeedResult>> = {}
  const queue: Job[] = []
  let running = 0

  const pump = () => {
    while (running < AT_ONCE && queue.length) {
      const j = queue.shift()!
      if (j.stopped) continue
      running++
      void o.fetch(j.spec.url).then(
        (r) => finish(j, r),
        (e: Error) => finish(j, { ok: false, status: 0, text: '', at: (o.now ?? Date.now)(), error: e.message })
      )
    }
  }
  const finish = (j: Job, r: FeedResult) => {
    running--
    if (!j.stopped) {
      ;(results[j.key] ??= {})[j.spec.id] = r
      o.onUpdate(j.key, j.spec.id, r)
      j.fails = r.ok ? 0 : j.fails + 1
      const wait = j.fails === 0 ? j.spec.every * 1000 : Math.min(MAX_WAIT_MS, j.spec.every * 1000 * 2 ** j.fails)
      j.cancel = schedule(() => (queue.push(j), pump()), wait)
    }
    pump()
  }
  const stopJob = (j: Job) => {
    j.stopped = true
    j.cancel?.()
  }

  return {
    /** What the widgets on screen want now: loads what is new, keeps what is unchanged, stops the rest. */
    sync(active: { key: string; feeds: FeedSpec[] }[]) {
      const want = new Map<string, { key: string; spec: FeedSpec; sig: string }>(active.flatMap((a) => a.feeds.map((f): [string, { key: string; spec: FeedSpec; sig: string }] => [`${a.key}/${f.id}`, { key: a.key, spec: f, sig: `${f.url} ${f.every}` }])))
      for (const [id, j] of jobs) {
        const w = want.get(id)
        if (w && w.sig === j.sig) continue
        stopJob(j)
        jobs.delete(id)
        if (results[j.key]) delete results[j.key]![j.spec.id]
      }
      for (const k of Object.keys(results)) if (!Object.keys(results[k]!).length || !active.some((a) => a.key === k)) delete results[k]
      for (const [id, w] of want) {
        if (jobs.has(id)) continue
        const j: Job = { ...w, fails: 0, cancel: null, stopped: false }
        jobs.set(id, j)
        queue.push(j)
      }
      pump()
    },
    state: () => results,
    stop() {
      for (const j of jobs.values()) stopJob(j)
      jobs.clear()
      queue.length = 0
    }
  }
}
