/** The shared library of skills, instructions and prompts, and the playbooks that say how agents use it. */
export type LibraryKind = 'skill' | 'instruction' | 'prompt'

export interface LibraryItem {
  id: string
  kind: LibraryKind
  name: string
  description: string
  /** What an agent reads when it asks for the item. */
  body: string
  /** Where it came from: a folder it was imported from, or "new". */
  source: string
  /** A skill's other files, relative to its folder. */
  files: string[]
  /** A skill's folder in the library (absolute); empty for the others. */
  dir: string
  tokens: { description: number; body: number }
}

export type RuleMode = 'always' | 'on-demand' | 'step' | 'off'
export type RuleStrength = 'soft' | 'medium' | 'hard'

/** One line of a playbook: how a scope uses one library item. */
export interface PlaybookRule {
  id: string
  mode: RuleMode
  /** For on-demand: when it applies, in words the agent can match to its task. */
  when: string
  strength: RuleStrength
}

/** What the forced check adds to a message, in tokens, as shown to people before it is on (a test keeps it near the real sentence). */
export const FORCED_CHECK_TOKENS = 62

/** A skill folder found on this computer that can be copied into the library. */
export interface LibraryCandidate {
  source: string
  name: string
  description: string
  dir: string
}

/** What an agent would be told for a workspace's playbook. */
export interface LibraryPreview {
  core: string
  coreTokens: number
  overBudget: boolean
  indexIds: string[]
  reminder: string
  rules: PlaybookRule[]
  /** What the forced check adds to a message that carries it (about, in tokens). */
  forcedCheckTokens: number
}

/** started: the opening text an agent was launched with (no item) · delivered: put in front of the agent at launch · triggered: the prompt matched the item's rule · fetched/skill/read: the agent used it · skipped: the agent said it did not apply, with its reason. */
export type How = 'started' | 'delivered' | 'triggered' | 'fetched' | 'skill' | 'read' | 'skipped'

export interface Use {
  t: number
  agent: string
  name: string
  provider: string
  workspace: string
  id: string
  how: How
  mode?: string
  /** The agent's own prompt count when it happened, to tell whether a trigger was answered in the same turn. */
  turn?: number
  /** When the agent was launched: turn counts start again at each launch, so a turn is told apart by (launch, turn). */
  launch?: number
  /** The exact words the agent was given (for started and triggered), so they can be shown as they were. */
  words?: string
  /** For triggered: the prompt looked related to the item when the reminder was given (only that yes or no is kept, never the prompt). */
  related?: boolean
  /** For skipped: why the agent passed the item over, in its words. */
  reason?: string
  /** For triggered by something the agent met rather than a message: what, in a few words ("merge conflict, 2 files"). */
  because?: string
}

export interface Tally {
  delivered: number
  triggered: number
  answered: number
  used: number
  /** Pointed at and the agent said, with a reason, that it did not apply. */
  declined: number
  /** Reminders that came on a prompt that looked related to the item, and how many of those the agent then read it for (in that launch, from then on). */
  related: number
  relatedAnswered: number
}
export interface ItemStats extends Tally {
  id: string
  /** What agents said when they passed it over, oldest first. */
  reasons: string[]
  byProvider: Record<string, Tally>
}
export interface Summary {
  items: Record<string, ItemStats>
  agents: Record<string, Tally & { name: string; provider: string }>
  /** Items that were used, most used first. */
  top: ItemStats[]
}

