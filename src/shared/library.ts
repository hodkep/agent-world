/** The shared library of skills, instructions and prompts, and the playbooks that say how agents use it. */
export type LibraryKind = 'skill' | 'instruction' | 'prompt'

/** A skill kept as a link: where its real folder is, and where it came from. The files stay where they are; the library holds only the link and this record. */
export interface SkillPlace {
  kind: SkillKind
  /** The real folder (links followed). */
  real: string
  /** For a project's skill: the project's folder. */
  project?: string
  /** Where it was installed from: a repository or a plugin and its version. */
  from?: string
  /** The place it was found in, as it was named when it was added. */
  label?: string
  license?: string
  accounts?: string[]
}

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
  /** What reading each of those files costs, in tokens (text files under 100 KB). */
  fileTokens?: Record<string, number>
  /** A skill's folder in the library (absolute); empty for the others. */
  dir: string
  tokens: { description: number; body: number }
  /** A skill that is a link to its real folder, with where that is; none for one kept in the library itself. */
  place?: SkillPlace
  /** A link whose real folder is gone: it can only be removed. */
  missing?: true
  /** What the skill's real folder takes on disk, measured in the background. */
  size?: { bytes: number; at: number }
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

/** Where each skill works: off for Claude, and its state in each place that reads skills from a folder. */
export interface SkillPlaces {
  /** Skills switched off for Claude's sessions in the app (all others are on). */
  claudeOff: string[]
  targets: { id: 'claude' | 'agy-cli' | 'agy-app' | 'project-claude' | 'project'; label: string; dir: string; present: boolean }[]
  /** Per skill, per target id: nothing there, our link, or something else of that name (left alone). */
  states: Record<string, Record<string, 'none' | 'linked' | 'copy'>>
  /** The projects the app knows, by the key the usage log uses for each. */
  projects: { key: string; path: string; name: string }[]
}

/** Where a skill's real folder is: the user's own global folders, a project's, or a Claude plugin's (managed by Claude). */
export type SkillKind = 'global' | 'project' | 'plugin'

/** A skill folder found on this computer that can be added to the library as a link. */
export interface LibraryCandidate {
  source: string
  name: string
  description: string
  dir: string
  /** The real folder, with links followed: two paths to one folder are one skill. */
  real: string
  kind: SkillKind
  /** For a project's skill: the project's folder. */
  project?: string
  /** Where it was installed from: a repository (from the skills CLI's lock file) or a plugin and its version. */
  from?: string
  license?: string
  /** For a plugin's skill: the accounts that have it. */
  accounts?: string[]
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
  /** The Claude account the agent ran on, when it had one of its own (entries before this was kept have none). */
  account?: string
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
/** One item's use: loads and reads in the last 30 days, the time of the last one ever (0 if none), and who used it in those days. */
export interface SkillUse {
  used: number
  last: number
  agents: string[]
  accounts: string[]
  /** Uses on each of the window's days, oldest first, today last. */
  days: number[]
  /** The agents that used it, by id (to draw each as its office figure) and name. */
  who: { id: string; name: string }[]
  /** Uses in the window by project (the workspace key of the agent that used it): where it is used most. */
  projects: Record<string, number>
}
export interface Summary {
  items: Record<string, ItemStats>
  agents: Record<string, Tally & { name: string; provider: string }>
  /** Items that were used, most used first. */
  top: ItemStats[]
}


/** What deleting a skill would remove, shown before anything is: its real folder, every link that points at it, and the rules that name it. */
export interface DeletePlan {
  id: string
  name: string
  /** The real folder to delete, with its size when known; none for a link whose folder is gone. */
  files: { path: string; bytes?: number }[]
  /** Links in a skills folder that lead to the skill: ours, and any the skills CLI made. They would be left broken. */
  links: string[]
  /** Rules in playbooks that name the skill. */
  rules: number
  /** A project skill that git tracks: deleting it shows as a deletion in that project. */
  tracked: boolean
  /** Why nothing may be deleted, when it may not. */
  refused?: string
}
