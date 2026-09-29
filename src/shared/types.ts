export type Activity =
  | 'idle'
  | 'thinking'
  | 'researching'
  | 'implementing'
  | 'running'
  | 'delegating'
  | 'waiting'
  | 'permission'
  | 'asleep'

export type AgentEvent =
  | { type: 'activity'; sessionId: string; subagentId?: string; activity: Activity; tool?: string; detail?: string }
  | { type: 'subagent-start'; sessionId: string; subagentId: string; subagentType: string }
  | { type: 'subagent-stop'; sessionId: string; subagentId: string }
  | { type: 'session-start'; sessionId: string }
  | { type: 'session-end'; sessionId: string }

export type Decision = 'allow' | 'deny'

export interface PermissionRequest {
  id: string
  sessionId: string
  tool: string
  detail: string
}

export interface AgentRecord {
  id: string
  name: string
  sessionId: string
  repoPath: string
  cwd: string
  branch: string | null
  // Whether a claude session with this id has been started before, so relaunch must use --resume.
  started: boolean
}

export interface AgentMessage {
  id: string
  fromId: string
  toId: string
  text: string
  status: 'queued' | 'delivered' | 'dropped'
  at: number
}
