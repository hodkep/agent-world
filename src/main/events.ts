import { basename } from 'node:path'
import type { Activity, AgentEvent } from '../shared/types'

const RESEARCH = new Set(['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch', 'LSP', 'ToolSearch'])
const IMPLEMENT = new Set(['Edit', 'Write', 'NotebookEdit'])
const DELEGATE = new Set(['Agent', 'Task'])
const MAX_DETAIL = 60

type Payload = Record<string, unknown>

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

function activityFor(tool: string): Activity {
  if (RESEARCH.has(tool)) return 'researching'
  if (IMPLEMENT.has(tool)) return 'implementing'
  if (DELEGATE.has(tool)) return 'delegating'
  if (tool === 'Bash') return 'running'
  return 'thinking'
}

export function describeTool(input: unknown): string | undefined {
  if (!input || typeof input !== 'object') return undefined
  const i = input as Payload
  if (typeof i.to === 'string' && typeof i.message === 'string') return `→ ${i.to}: ${i.message}`.slice(0, MAX_DETAIL)
  const file = str(i.file_path) ?? str(i.notebook_path)
  const raw = file ? basename(file) : (str(i.command) ?? str(i.pattern) ?? str(i.query) ?? str(i.url) ?? str(i.description))
  return raw?.slice(0, MAX_DETAIL)
}

export function normalize(payload: unknown): AgentEvent | null {
  if (!payload || typeof payload !== 'object') return null
  const p = payload as Payload
  const sessionId = str(p.session_id)
  const event = str(p.hook_event_name)
  if (!sessionId || !event) return null
  const subagentId = str(p.agent_id)
  const activity = (a: Activity, tool?: string, detail?: string): AgentEvent => ({
    type: 'activity',
    sessionId,
    ...(subagentId && { subagentId }),
    activity: a,
    ...(tool && { tool }),
    ...(detail && { detail })
  })

  switch (event) {
    case 'PreToolUse': {
      const tool = str(p.tool_name) ?? 'unknown'
      return activity(activityFor(tool), tool, describeTool(p.tool_input))
    }
    case 'UserPromptSubmit':
    case 'PostToolUse':
    case 'PostToolUseFailure':
      return activity('thinking')
    case 'Stop':
      return activity('idle')
    case 'Notification':
      return str(p.notification_type) === 'idle_prompt' ? activity('waiting') : null
    case 'SubagentStart':
      return subagentId ? { type: 'subagent-start', sessionId, subagentId, subagentType: str(p.agent_type) ?? 'agent' } : null
    case 'SubagentStop':
      return subagentId ? { type: 'subagent-stop', sessionId, subagentId } : null
    case 'SessionStart':
      return { type: 'session-start', sessionId }
    case 'SessionEnd':
      return { type: 'session-end', sessionId }
    default:
      return null
  }
}
