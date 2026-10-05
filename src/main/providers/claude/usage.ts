import type { LimitWindow } from '../../../shared/types'

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** How far a zone is ahead of UTC at an instant, in ms; 0 for a name Intl does not know. */
function offsetMs(tz: string, at: number) {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(at).map((x) => [x.type, Number(x.value)]))
    return Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!) - Math.floor(at / 1000) * 1000
  } catch {
    return 0
  }
}

/** "Oct 6 at 1:20am" in a named zone, as an instant: the next time that is on the clock there. */
export function parseReset(text: string, tz: string, now: number): number | null {
  const m = /^([A-Za-z]{3})[a-z]*\s+(\d{1,2})\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i.exec(text.trim())
  const month = m ? MONTHS.indexOf(m[1]!.toLowerCase()) : -1
  if (!m || month < 0) return null
  const hour = (Number(m[3]) % 12) + (m[5]!.toLowerCase() === 'pm' ? 12 : 0)
  const at = (year: number) => {
    const wall = Date.UTC(year, month, Number(m[2]), hour, Number(m[4] ?? 0))
    return wall - offsetMs(tz, wall - offsetMs(tz, wall))
  }
  const year = new Date(now).getUTCFullYear()
  const t = at(year)
  // A reset is ahead of now: one that reads as long past is next year's.
  return t < now - 24 * 3600_000 ? at(year + 1) : t
}

/**
 * `claude -p "/usage"` prints "Current session: 29% used · resets Oct 6 at 1:20am (Asia/Calcutta)", the same for
 * "Current week (all models)" and one line per model with its own weekly limit.
 */
export function parseClaudeUsage(out: string, now = Date.now()): LimitWindow[] {
  return out.split('\n').flatMap((line): LimitWindow[] => {
    const m = /^Current (session|week)(?: \(([^)]+)\))?:\s*(\d+(?:\.\d+)?)% used(?:\s*·\s*resets\s+(.+?)(?:\s*\(([^)]+)\))?)?\s*$/.exec(line.trim())
    if (!m) return []
    const reset = m[4] ? parseReset(m[4], m[5] ?? Intl.DateTimeFormat().resolvedOptions().timeZone, now) : null
    const model = m[2] && m[2] !== 'all models' ? m[2] : ''
    return [
      {
        provider: 'claude',
        group: model ? `Claude Code (${model})` : 'Claude Code',
        kind: m[1] === 'session' ? 'five_hour' : 'weekly',
        remainingPct: Math.max(0, 100 - Number(m[3])),
        resetsAt: new Date(reset ?? now).toISOString()
      }
    ]
  })
}
