/** How a subagent's task reads in a list, and what ties the chat's call to start it to the subagent it made. */
export const spawnLabel = (task: string) => task.replace(/\s+/g, ' ').trim().slice(0, 80)

/** The tool an agent calls to start another as its subagent, however its program names it. */
export const isSpawnCall = (name: string) => /(^|__)spawn_subagent$/.test(name)

/** Waiting on a subagent is the agent checking on it again; the subagent's own row says how it is getting on, so the call is not drawn. */
export const isAwaitCall = (name: string) => /(^|__)await_subagents$/.test(name)
