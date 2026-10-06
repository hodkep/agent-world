/** One thing in an agent's conversation, as the chat view draws it. Built from Claude's saved transcript. */
/** What a hook told the agent, taken apart so the chat can show who said it and what it found. */
export interface HookInfo {
  /** Who is speaking, from the [name] a hook starts with. */
  source?: string
  /** The hook event, as Claude names it ("Stop", "PostToolUse:Edit"). */
  event: string
  /** What it is about, without the count. */
  title: string
  issues?: number
  /** One per "- L12 [rule] text" line; empty when the hook words things its own way. */
  findings: { ref: string; rule: string; text: string }[]
}

/** What kind of system event a note is, so the chat draws it as a chip with the right glyph. */
export type NoteEvent = 'monitor' | 'interrupted' | 'failed' | 'command' | 'compact' | 'hook'

export type ChatItem =
  | { kind: 'user'; id: string; at: number; text: string }
  | { kind: 'command'; id: string; at: number; name: string; args: string }
  | { kind: 'assistant'; id: string; at: number; text: string }
  | { kind: 'thinking'; id: string; at: number }
  | { kind: 'tool'; id: string; at: number; toolUseId: string; name: string; input: Record<string, unknown> }
  /** Work this agent handed to another one: not part of its conversation file, drawn where it was sent. */
  | { kind: 'handoff-out'; id: string; at: number; to: string; status: 'queued' | 'delivered' | 'dropped'; text: string }
  | { kind: 'image'; id: string; at: number; mediaType: string; /** A data: URL, or '' when the picture was too big to carry. */ src: string }
  | { kind: 'shell'; id: string; at: number; command: string }
  | { kind: 'shell-out'; id: string; at: number; stdout: string; stderr: string }
  | { kind: 'tool-result'; id: string; at: number; toolUseId: string; text: string; isError: boolean; images?: string[] }
  /** What a subagent run in the background handed back when it finished. */
  | { kind: 'subagent-report'; id: string; at: number; agentId: string; body: string }
  | { kind: 'note'; id: string; at: number; text: string; /** A longer body (the compact summary, what a hook said) the view keeps behind a button. */ detail?: string; /** What that button calls the body ("details"); the compact summary needs none. */ detailLabel?: string; /** Set when the note is what a hook told the agent. */ hook?: HookInfo; /** Set when the note is a system event (a Monitor firing, an interrupt, a failed task…). */ event?: NoteEvent; /** What makes events of one source one chip: a monitor's task id. */ key?: string; /** Set for trouble, which the chat draws in red. */ tone?: 'bad' }

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
  /** How many levels below the main conversation it runs (1 is started by the main agent). */
  depth: number
  /** Run in the background, so the main agent carries on while it works. */
  background: boolean
  /** The calls (by their tool call id) with which it started subagents of its own. */
  spawns: string[]
  /** It was stopped (Claude ends its file with the interruption) and has not carried on since. */
  stopped: boolean
}
