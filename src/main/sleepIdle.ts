import type { Activity } from '../shared/types'

export interface SleepDeps {
  ids: string[]
  activity: (id: string) => Activity | undefined
  /** When the agent last wrote anything to its terminal or was last at work. */
  quietSince: (id: string) => number
  hasChildren: (id: string) => boolean
  pending: (id: string) => number
  /** How many commands the agent left running (a dev server, a watcher): sleeping would stop them. */
  procs: (id: string) => Promise<number>
  sleep: (id: string) => void
  now: number
  /** Milliseconds idle before sleeping; 0 is off. */
  after: number
}

/** Puts to sleep the running agents that have sat idle for `after` ms with nothing depending on them; returns who went. */
export async function sleepIdle(d: SleepDeps): Promise<string[]> {
  const slept: string[] = []
  if (d.after <= 0) return slept
  for (const id of d.ids) {
    // Only a plain idle (none yet: no turn since it started): "waiting" holds a question or a menu that a restart would lose.
    const act = d.activity(id)
    if ((act && act !== 'idle') || d.now - d.quietSince(id) < d.after || d.hasChildren(id) || d.pending(id)) continue
    if (await d.procs(id)) continue
    d.sleep(id)
    slept.push(id)
  }
  return slept
}
