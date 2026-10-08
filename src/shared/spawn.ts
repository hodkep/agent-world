/** How a subagent's task reads in a list, and what ties the chat's call to start it to the subagent it made. */
export const spawnLabel = (task: string) => task.replace(/\s+/g, ' ').trim().slice(0, 80)

/** The tool an agent calls to start another as its subagent, however its program names it. */
export const isSpawnCall = (name: string) => /(^|__)spawn_subagent$/.test(name)
