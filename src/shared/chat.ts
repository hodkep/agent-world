/** One thing in an agent's conversation, as the chat view draws it. Built from Claude's saved transcript. */
export type ChatItem =
  | { kind: 'user'; id: string; at: number; text: string }
  | { kind: 'command'; id: string; at: number; name: string; args: string }
  | { kind: 'assistant'; id: string; at: number; text: string }
  | { kind: 'thinking'; id: string; at: number }
  | { kind: 'tool'; id: string; at: number; toolUseId: string; name: string; input: Record<string, unknown> }
  | { kind: 'image'; id: string; at: number; mediaType: string; /** A data: URL, or '' when the picture was too big to carry. */ src: string }
  | { kind: 'shell'; id: string; at: number; command: string }
  | { kind: 'shell-out'; id: string; at: number; stdout: string; stderr: string }
  | { kind: 'tool-result'; id: string; at: number; toolUseId: string; text: string; isError: boolean; images?: string[] }
  | { kind: 'note'; id: string; at: number; text: string; /** A longer body (the compact summary) the view keeps behind "Show summary". */ detail?: string }

/** One call a subagent made, as a line of its trail. */
export interface SubagentCall {
  at: number
  name: string
  /** The file, command or pattern, in a few words. */
  detail: string
}

/** A subagent as Claude saved it next to the session: who it is, what it did so far, and whether it has answered. */
export interface SubagentInfo {
  agentId: string
  /** The call in the main conversation that started it. */
  toolUseId: string
  type: string
  description: string
  startedAt: number
  updatedAt: number
  /** It has given its final answer. */
  done: boolean
  calls: SubagentCall[]
  result: string
}
