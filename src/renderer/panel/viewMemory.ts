/** The tabs worth coming back to: the others depend on the agent (a file) or on a setting (Workflow, Library). */
const KEPT = new Set(['chat', 'terminal', 'code', 'tools', 'preview', 'traces'])

/** What each workspace's panel was showing when it was left, by workspace path. */
export type ViewMemory = Record<string, string>

export const leaving = (mem: ViewMemory, folder: string | null, view: string): ViewMemory => (folder && KEPT.has(view) ? { ...mem, [folder]: view } : mem)

export const arriving = <T extends string>(mem: ViewMemory, folder: string, usual: T): T | string => mem[folder] ?? usual
