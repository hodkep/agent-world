/** What a subagent run in the background says when it is done: the harness types it into the conversation as a message. */
export interface Handback {
  agentId: string
  body: string
}

const HANDBACK = /<agent-message from="([^"]+)">\n\[Subagent hand-back\][^\n]*?The report follows:\n([\s\S]*?)\n<\/agent-message>/

/** The report in a "Subagent hand-back" message (its lines are indented by the harness), or null for any other text. */
export function parseHandback(text: string): Handback | null {
  const m = HANDBACK.exec(text)
  if (!m) return null
  const body = m[2]!.split('\n').map((l) => l.replace(/^ {2}/, '')).join('\n').trim()
  return { agentId: m[1]!, body }
}

export interface TaskNotice {
  taskId: string
  status: string
  summary: string
}

const field = (text: string, name: string) => new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(text)?.[1]?.trim() ?? ''

/** The notice that a background task ended (completed, failed, stopped), or null for any other text. */
export function parseTaskNotification(text: string): TaskNotice | null {
  if (!text.trimStart().startsWith('<task-notification>')) return null
  return { taskId: field(text, 'task-id'), status: field(text, 'status'), summary: field(text, 'summary') }
}
