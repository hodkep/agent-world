export const OPEN_SUBAGENT = 'aw-open-subagent'

/** Asks the app to show a subagent's conversation in the panel beside the chat. */
export const openSubagent = (agentId: string, subagentId: string) => window.dispatchEvent(new CustomEvent(OPEN_SUBAGENT, { detail: { agentId, subagentId } }))
