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
  hardReminder: string
  rules: PlaybookRule[]
}

/** started: the opening text an agent was launched with (no item) · delivered: put in front of the agent at launch · triggered: the prompt matched the item's rule · fetched/skill/read: the agent used it. */
export type How = 'started' | 'delivered' | 'triggered' | 'fetched' | 'skill' | 'read'

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
}

export interface Tally {
  delivered: number
  triggered: number
  answered: number
  used: number
}
export interface ItemStats extends Tally {
  id: string
  byProvider: Record<string, Tally>
}
export interface Summary {
  items: Record<string, ItemStats>
  agents: Record<string, Tally & { name: string; provider: string }>
  /** Items that were used, most used first. */
  top: ItemStats[]
}

