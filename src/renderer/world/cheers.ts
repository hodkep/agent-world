import type { Activity } from '../../shared/types'

const WORKING: ReadonlySet<string> = new Set(['thinking', 'researching', 'implementing', 'running', 'delegating', 'compacting'])
/** How long a turn has to have worked before ending it is worth a cheer. */
const WORK_MS = 8000
const GAP_MS = 5000

/**
 * When an agent finishing is something to cheer: a turn that worked for at least 8 s and ended with no task left open (a small cheer), or a task the agent finished (its done count went
 * up: a big one, though short). Nothing for an agent seen for the first time, and one agent is not cheered again within a few seconds.
 */
export class Cheers {
  private readonly since = new Map<string, number>()
  private readonly done = new Map<string, number>()
  private readonly last = new Map<string, Activity>()
  private readonly big = new Set<string>()
  private readonly at = new Map<string, number>()

  /** `taskOpen`: the agent announced a task and has not finished it: its turn ending is not its work being done (it may have a command running in the background). */
  observe(key: string, activity: Activity, tasksDone: number, now: number, taskOpen = false): 'small' | 'big' | null {
    const before = this.last.get(key)
    const doneBefore = this.done.get(key)
    this.last.set(key, activity)
    this.done.set(key, tasksDone)
    if (before === undefined) return null
    const working = WORKING.has(activity)
    if (working && !WORKING.has(before)) this.since.set(key, now)
    if (doneBefore !== undefined && tasksDone > doneBefore) this.big.add(key)
    let cheer: 'small' | 'big' | null = null
    if (!working && this.big.has(key) && (WORKING.has(before) || (doneBefore !== undefined && tasksDone > doneBefore)) && activity === 'idle') cheer = 'big'
    else if (!taskOpen && !working && WORKING.has(before) && activity === 'idle' && now - (this.since.get(key) ?? now) >= WORK_MS) cheer = 'small'
    if (!working && activity === 'idle') {
      if (cheer === 'big') this.big.delete(key)
      if (WORKING.has(before)) this.since.delete(key)
    }
    if (cheer && now - (this.at.get(key) ?? -Infinity) < GAP_MS) return null
    if (cheer) this.at.set(key, now)
    return cheer
  }
}
