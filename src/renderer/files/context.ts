import { createContext } from 'react'

/** Which agent's conversation a card is drawn in, so a file it mentions opens for that agent. */
export const AgentIdContext = createContext('')

/** Ask the app to open a file an agent mentioned: in the Code tab, the viewer, or the machine's own program. */
export function openFileEvent(agentId: string, path: string) {
  window.dispatchEvent(new CustomEvent('aw-open-file', { detail: { agentId, path } }))
}

/** What to call a page shown from a file (its address is temporary and says nothing). */
export const pageLabels = new Map<string, string>()
