/** How a subagent's task reads in a list, and what ties the chat's call to start it to the subagent it made. */
export const spawnLabel = (task: string) => task.replace(/\s+/g, ' ').trim().slice(0, 80)

/** The tool an agent calls to start another as its subagent, however its program names it. */
export const isSpawnCall = (name: string) => /(^|__)spawn_subagent$/.test(name)

/** Waiting on a subagent is the agent checking on it again; the subagent's own row says how it is getting on, so the call is not drawn. */
export const isAwaitCall = (name: string) => /(^|__)await_subagents$/.test(name)

/** The name a model is shown by: the ids Claude saves ("claude-sonnet-5-5") as "Sonnet 5.5"; any other name as it is. */
export function modelLabel(model: string | undefined): string {
  if (!model) return ''
  const m = /^claude-(opus|sonnet|haiku|fable)-(\d+)(?:-(\d{1,2}))?(?:-|$)/.exec(model)
  if (!m) return model
  return `${m[1]![0]!.toUpperCase()}${m[1]!.slice(1)} ${m[2]}${m[3] ? `.${m[3]}` : ''}`
}
