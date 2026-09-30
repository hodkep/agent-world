/** One thing in an agent's conversation, as the chat view draws it. Built from Claude's saved transcript. */
export type ChatItem =
  | { kind: 'user'; id: string; at: number; text: string }
  | { kind: 'command'; id: string; at: number; name: string; args: string }
  | { kind: 'assistant'; id: string; at: number; text: string }
  | { kind: 'thinking'; id: string; at: number }
  | { kind: 'tool'; id: string; at: number; toolUseId: string; name: string; input: Record<string, unknown> }
  | { kind: 'tool-result'; id: string; at: number; toolUseId: string; text: string; isError: boolean }
  | { kind: 'note'; id: string; at: number; text: string }
