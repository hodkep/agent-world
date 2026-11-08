export type GitKind = 'commit' | 'push' | 'pr'

// Biggest first: a chain that commits, pushes and opens a pull request is one delivery, of the pull request.
const KINDS: [GitKind, RegExp][] = [
  ['pr', /\bgh\s+pr\s+create(?![\w-])/],
  ['push', /\bgit\s+(?:-C\s+\S+\s+)?push(?![\w-])/],
  ['commit', /\bgit\s+(?:-C\s+\S+\s+)?commit(?![\w-])/]
]

/** What the command an agent is running hands over to the git courier, or null for anything else. */
export const gitKind = (command: string): GitKind | null => KINDS.find(([, re]) => re.test(command))?.[0] ?? null

/** The agent events come in batches of 150 ms and a commit is over in less: so the courier is called from the event itself, not from the state it leaves behind. */
export const gitKindOfEvent = (e: { type: string; activity?: string; tool?: string; detail?: string }): GitKind | null =>
  e.type === 'activity' && e.activity === 'running' && e.tool === 'Bash' && e.detail ? gitKind(e.detail) : null
