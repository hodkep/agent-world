import type { Activity } from './types'

/** What the person's message says to an agent that was stopped so its account could change. */
export const SWITCH_CONTINUE = 'continue'

/** One agent as the "switch all to this account" action sees it. `account` is '' for the program's own login. */
export interface SwitchAgent {
  id: string
  name: string
  provider: string
  account: string
  /** The folder of the project it works in; agents are grouped by it. */
  project: string
  /** Its terminal is running now; an agent that is not is asleep. */
  online: boolean
  activity: Activity | null
  /** What it is doing, in a few words, for the list. */
  detail?: string
}

/** Mid-turn, or waiting on one of your permission requests: the account cannot change under it until it is stopped. Idle and waiting for your message are not. */
export const isWorking = (a: SwitchAgent) => a.online && !['idle', 'waiting', null].includes(a.activity)

/** How many agents a "switch all" run restarts at once: every one relaunching in the same moment swamped a computer with a big office. */
export const SWITCH_BATCH = 3

/** What happened to one agent in a "switch all" run; `stopping` and `starting` are progress, the rest are final. `left` is one the run never reached because the person stopped it. */
export interface SwitchResult {
  id: string
  name: string
  state: 'stopping' | 'starting' | 'moved' | 'continued' | 'failed' | 'left'
  error?: string
}

export interface SwitchPlan {
  /** Working now: stopped first, moved, then told to continue. */
  stop: SwitchAgent[]
  /** Idle, waiting or asleep: moved without a word. */
  quiet: SwitchAgent[]
  already: SwitchAgent[]
  /** Agents left out by the person's choice: they stay where they are. */
  left: SwitchAgent[]
  unsupported: SwitchAgent[]
  /** How many agents change account. */
  moving: number
}

/**
 * Sorts every agent by what moving it to `account` means for it. `canSwitch` says which programs keep separate accounts. With `picked` only those agents move, and a
 * picked agent that is already on the account is restarted on it (how one whose process kept the old login is put right); without it every agent not on the account moves.
 */
export function planSwitch(agents: SwitchAgent[], account: string, canSwitch: (provider: string) => boolean, picked?: ReadonlySet<string>): SwitchPlan {
  const plan: SwitchPlan = { stop: [], quiet: [], already: [], left: [], unsupported: [], moving: 0 }
  for (const a of agents) {
    if (!canSwitch(a.provider)) plan.unsupported.push(a)
    else if (picked && !picked.has(a.id)) plan.left.push(a)
    else if (!picked && a.account === account) plan.already.push(a)
    else (isWorking(a) ? plan.stop : plan.quiet).push(a)
  }
  plan.moving = plan.stop.length + plan.quiet.length
  return plan
}

/** The agents ticked when the dialog opens: those that can change account and are not on it yet. */
export const pickedByDefault = (agents: SwitchAgent[], account: string, canSwitch: (provider: string) => boolean): Set<string> =>
  new Set(agents.filter((a) => canSwitch(a.provider) && a.account !== account).map((a) => a.id))

/** The agents grouped by project, in the order they come, each group named by its folder. */
export function byProject(agents: SwitchAgent[]): { project: string; name: string; agents: SwitchAgent[] }[] {
  const groups = new Map<string, SwitchAgent[]>()
  for (const a of agents) groups.set(a.project, [...(groups.get(a.project) ?? []), a])
  return [...groups].map(([project, list]) => ({ project, name: project.split(/[\\/]/).filter(Boolean).pop() ?? project, agents: list }))
}
