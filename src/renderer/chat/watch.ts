const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad = (n: number) => String(n).padStart(2, '0')
const clock = (ms: number) => {
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const str = (v: unknown) => (typeof v === 'string' ? v : '')

/** A 5-field cron expression (minute hour day-of-month month day-of-week, local time) in words; one that is not a common pattern stays as it is written. */
export function cronWords(cron: string, repeat: boolean): string {
  const f = cron.trim().split(/\s+/)
  if (f.length !== 5 || !cron.trim()) return ''
  const [mi, h, dom, mon, dow] = f as [string, string, string, string, string]
  const n = /^\d+$/
  if (/^\*\/\d+$/.test(mi) && h === '*' && dom === '*' && mon === '*' && dow === '*') return `every ${mi.slice(2)} minutes`
  if (n.test(mi) && h === '*' && dom === '*' && mon === '*' && dow === '*') return `every hour at :${pad(Number(mi))}`
  if (n.test(mi) && n.test(h) && dom === '*' && mon === '*') {
    const at = `${pad(Number(h))}:${pad(Number(mi))}`
    if (dow === '*') return `every day at ${at}`
    if (dow === '1-5') return `every weekday at ${at}`
    if (n.test(dow)) return `every ${DAYS[Number(dow) % 7]} at ${at}`
  }
  if (!repeat && n.test(mi) && n.test(h) && n.test(dom) && n.test(mon) && dow === '*') return `once, ${Number(dom)} ${MONTHS[Number(mon) - 1] ?? mon} at ${pad(Number(h))}:${pad(Number(mi))}`
  return `cron ${cron.trim()}`
}

/** One cron field as the set of numbers it allows, or null when it cannot be read. */
function field(src: string, lo: number, hi: number): Set<number> | null {
  const out = new Set<number>()
  for (const part of src.split(',')) {
    const m = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(part)
    if (!m) return null
    const step = m[2] ? Number(m[2]) : 1
    if (step < 1) return null
    let from = lo
    let to = hi
    if (m[1] !== '*') {
      const [a, b] = m[1]!.split('-')
      from = Number(a)
      to = b === undefined ? (m[2] ? hi : from) : Number(b)
    }
    if (from < lo || to > hi || from > to) return null
    for (let v = from; v <= to; v += step) out.add(v)
  }
  return out
}

/** The first minute after `after` (ms) that a cron expression matches, in local time; null when it cannot be read or never matches within a year. */
export function nextCron(cron: string, after: number): number | null {
  const f = cron.trim().split(/\s+/)
  if (f.length !== 5) return null
  const sets = [field(f[0]!, 0, 59), field(f[1]!, 0, 23), field(f[2]!, 1, 31), field(f[3]!, 1, 12), field(f[4]!.replace(/7/g, '0'), 0, 6)]
  if (sets.some((s) => !s)) return null
  const [mi, h, dom, mon, dow] = sets as Set<number>[]
  const d = new Date(after)
  d.setSeconds(0, 0)
  d.setMinutes(d.getMinutes() + 1)
  // Day by day, then the hour and minute: a year is a few hundred thousand steps at most.
  for (let guard = 0; guard < 366 * 24 * 60 && guard >= 0; guard++) {
    if (!mon!.has(d.getMonth() + 1)) (d.setMonth(d.getMonth() + 1, 1), d.setHours(0, 0, 0, 0))
    else if (!dom!.has(d.getDate()) || !dow!.has(d.getDay())) (d.setDate(d.getDate() + 1), d.setHours(0, 0, 0, 0))
    else if (!h!.has(d.getHours())) (d.setHours(d.getHours() + 1, 0, 0, 0))
    else if (!mi!.has(d.getMinutes())) d.setMinutes(d.getMinutes() + 1)
    else return d.getTime()
  }
  return null
}

/** A length of time in the biggest units that read well. */
export function inWords(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 1) return 'now'
  if (s < 90) return `${s} s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} h ${m % 60} m`
  const d = Math.floor(h / 24)
  return `${d} d ${h % 24} h`
}

/** What the answer to starting a monitor says: its task, and how long it is watched. */
export function monitorTask(text: string): { id: string; ms: number } {
  const id = /task\s+([A-Za-z0-9_-]+)/.exec(text)?.[1] ?? ''
  const expires = /expires in (\d+)\s*(s|m|h)\b/.exec(text)
  const timeout = /timeout\s+(\d+)\s*ms/.exec(text)
  const ms = expires ? Number(expires[1]) * { s: 1000, m: 60_000, h: 3_600_000 }[expires[2] as 's' | 'm' | 'h'] : timeout ? Number(timeout[1]) : 0
  return { id, ms }
}

export type MonitorState = 'starting' | 'watching' | 'fired' | 'ended' | 'expired' | 'failed'

export interface WatchRun {
  input: Record<string, unknown>
  /** When it was called, in ms. */
  at?: number
  result?: { text: string; isError: boolean }
  /** What it printed, each time it fired. */
  firings?: { at: number; text: string }[]
  /** When its source ended by itself, if it did. */
  ended?: number
}

export function monitorView(run: WatchRun, now: number): { state: MonitorState; id: string; remainingMs: number; totalMs: number; fill: number } {
  const { id, ms } = monitorTask(run.result?.text ?? '')
  const totalMs = ms || num(run.input.timeout_ms)
  const left = Math.max(0, (run.at ?? now) + totalMs - now)
  const fill = totalMs ? Math.min(1, Math.max(0, 1 - left / totalMs)) : 0
  const base = { id, remainingMs: left, totalMs, fill }
  if (!run.result) return { ...base, state: 'starting' }
  if (run.result.isError) return { ...base, state: 'failed' }
  if (run.ended) return { ...base, state: 'ended' }
  if (totalMs && left <= 0) return { ...base, state: 'expired' }
  return { ...base, state: run.firings?.length ? 'fired' : 'watching' }
}

export type ScheduleState = 'waiting' | 'repeats' | 'ran' | 'cancelled'

export interface ScheduleRun {
  input: Record<string, unknown>
  at?: number
  result?: { text: string; isError: boolean }
  /** A later call cancelled it. */
  cancelled?: boolean
}

function dayWord(ms: number, now: number): string {
  const d = new Date(ms)
  const n = new Date(now)
  const days = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime()) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days > 1 && days < 7) return DAYS[d.getDay()]!.slice(0, 3)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

/** A schedule as the card says it: what it is for, when, and what became of it. */
export function scheduleView(run: ScheduleRun, now: number): { state: ScheduleState; title: string; repeat: string; when: string; left: string; fill: number; target: number | null } {
  const i = run.input
  const cron = str(i.cron)
  const repeat = i.repeat === true
  const prompt = str(i.prompt)
  const title = str(i.reason).trim() || prompt.trim().split('\n')[0]!.trim() || 'Scheduled task'
  const called = run.at ?? now
  let target: number | null = null
  if (cron) target = nextCron(cron, called)
  else {
    let given: number | null = null
    try {
      const v = JSON.parse(run.result?.text ?? '') as { scheduledFor?: unknown }
      given = typeof v.scheduledFor === 'number' ? v.scheduledFor : null
    } catch {
      /* the answer is not JSON: the time is worked out from the delay */
    }
    target = given ?? (num(i.inSeconds) ? called + num(i.inSeconds) * 1000 : null)
  }
  const words = cron ? cronWords(cron, repeat) : ''
  const base = { title, repeat: cron ? words : '', target }
  // A timer that something it waited for cut short has done its work already.
  if (!run.cancelled && /cancelled early|early-termination/i.test(run.result?.text ?? '')) return { ...base, state: 'ran', when: 'Woke early', left: '', fill: 1 }
  if (run.cancelled) return { ...base, state: 'cancelled', when: target ? `Was: ${nextLabel(target, now)}` : 'Cancelled', left: '', fill: 0 }
  if (cron && repeat) {
    const next = nextCron(cron, now) ?? target
    return { ...base, state: 'repeats', when: next ? `Next: ${nextLabel(next, now)}` : words, left: next ? inWords(next - now) : '', fill: next && target && next > called ? Math.min(1, (now - called) / (next - called)) : 0 }
  }
  if (target === null) return { ...base, state: 'waiting', when: 'at a time it did not say', left: '', fill: 0 }
  if (now >= target) return { ...base, state: 'ran', when: `Ran at ${clock(target)}`, left: '', fill: 1 }
  return { ...base, state: 'waiting', when: `${dayWord(target, now)} at ${clock(target)}`, left: inWords(target - now), fill: Math.min(1, Math.max(0, (now - called) / (target - called))) }
}

/** The day by its short name for the coming week ("Thu 09:00"), "today" for today. */
function nextLabel(ms: number, now: number): string {
  const w = dayWord(ms, now)
  if (w === 'Today') return `today ${clock(ms)}`
  return `${w === 'Tomorrow' ? DAYS[new Date(ms).getDay()]!.slice(0, 3) : w} ${clock(ms)}`
}

/** The id a schedule was answered with, in whatever way the answer says it: JSON, or a line like "Job ID: abc123". Empty when it says none. */
export function jobId(text: string): string {
  try {
    const v = JSON.parse(text) as { id?: unknown; jobId?: unknown; job_id?: unknown }
    const id = v.id ?? v.jobId ?? v.job_id
    if (typeof id === 'string' && id) return id
  } catch {
    /* not JSON */
  }
  return /\b(?:job(?:\s*id)?|id)\s*[:=]?\s*["']?([A-Za-z0-9_-]{4,})/i.exec(text)?.[1] ?? ''
}
