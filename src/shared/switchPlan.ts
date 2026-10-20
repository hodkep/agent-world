import type { Activity } from './types'

/** What the person's message says to an agent that was stopped so its account could change. */
export const SWITCH_CONTINUE = 'continue'

/** One agent as the "switch all to this account" action sees it. `account` is '' for the program's own login. */
export interface SwitchAgent {
  id: string
  name: string
  provider: string
  account: string
  /** Its terminal is running now; an agent that is not is asleep. */
  online: boolean
  activity: Activity | null
  /** What it is doing, in a few words, for the list. */
  detail?: string
}

/** Mid-turn, or waiting on one of your permission requests: the account cannot change under it until it is stopped. Idle and waiting for your message are not. */
export const isWorking = (a: SwitchAgent) => a.online && !['idle', 'waiting', null].includes(a.activity)

/** What happened to one agent in a "switch all" run; `stopping` is progress, the rest are final. */
export interface SwitchResult {
  id: string
  name: string
  state: 'stopping' | 'moved' | 'continued' | 'failed'
  error?: string
}

export interface SwitchPlan {
  /** Working now: stopped first, moved, then told to continue. */
  stop: SwitchAgent[]
  /** Idle, waiting or asleep: moved without a word. */
  quiet: SwitchAgent[]
  already: SwitchAgent[]
  unsupported: SwitchAgent[]
  /** How many agents change account. */
  moving: number
}

/** Sorts every agent by what moving it to `account` means for it. `canSwitch` says which programs keep separate accounts. */
export function planSwitch(agents: SwitchAgent[], account: string, canSwitch: (provider: string) => boolean): SwitchPlan {
  const plan: SwitchPlan = { stop: [], quiet: [], already: [], unsupported: [], moving: 0 }
  for (const a of agents) {
    if (!canSwitch(a.provider)) plan.unsupported.push(a)
    else if (a.account === account) plan.already.push(a)
    else (isWorking(a) ? plan.stop : plan.quiet).push(a)
  }
  plan.moving = plan.stop.length + plan.quiet.length
  return plan
}
