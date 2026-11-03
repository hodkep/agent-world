import type { Activity } from '../shared/types'

export interface SleepDeps {
  ids: string[]
  activity: (id: string) => Activity | undefined
  /** When the agent was last at work, started, or typed to (see quietSince). */
  quietSince: (id: string) => number
  hasChildren: (id: string) => boolean
  pending: (id: string) => number
  /** The agent has an open workflow run: its approvals and gates are sent to the agent, which a sleeping one cannot take. */
  inRun: (id: string) => boolean
  /** How many commands the agent left running (a dev server, a watcher): sleeping would stop them. */
  procs: (id: string) => Promise<number>
  sleep: (id: string) => void
  now: number
  /** Milliseconds idle before sleeping; 0 is off. */
  after: number
}

/** When an agent was last really in use: at work, started, or typed to. Terminal output is left out: a redraw after the laptop wakes or the pane resizes is not use. */
export const quietSince = (t: { busy?: number; spawned?: number; typed?: number }) => Math.max(t.busy ?? 0, t.spawned ?? 0, t.typed ?? 0)

/** Why an agent cannot be put to sleep now, in words for the person; empty when it can. Time is not part of it: the person asked. */
export async function sleepBlocker(d: SleepDeps, id: string): Promise<string> {
  const act = d.activity(id)
  if (act === 'waiting') return 'It is waiting for you; answer it first.'
  if (act && act !== 'idle') return 'Wait until it finishes its turn.'
  if (d.hasChildren(id)) return 'It has agents working for it.'
  if (d.pending(id)) return 'It has a message it has not read yet.'
  if (d.inRun(id)) return 'It is part of an open workflow run.'
  const n = await d.procs(id)
  return n ? `${n === 1 ? 'A command it left running' : `${n} commands it left running`} would stop.` : ''
}

/** Puts to sleep the running agents that have sat idle for `after` ms with nothing depending on them; returns who went. */
export async function sleepIdle(d: SleepDeps): Promise<string[]> {
  const slept: string[] = []
  if (d.after <= 0) return slept
  // Only a plain idle (none yet: no turn since it started): "waiting" holds a question or a menu that a restart would lose.
  const due = (id: string) => {
    const act = d.activity(id)
    return !(act && act !== 'idle') && d.now - d.quietSince(id) >= d.after && !d.hasChildren(id) && !d.pending(id) && !d.inRun(id)
  }
  for (const id of d.ids) {
    if (!due(id)) continue
    if (await d.procs(id)) continue
    // The look at its commands takes a moment; the agent may have been given work in it.
    if (!due(id)) continue
    d.sleep(id)
    slept.push(id)
  }
  return slept
}
