import { basename } from 'node:path'
import type { Activity, Question, RawEvent, TaskStatus } from '../shared/types'

const RESEARCH = new Set(['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch', 'LSP', 'ToolSearch'])
const IMPLEMENT = new Set(['Edit', 'Write', 'NotebookEdit'])
const DELEGATE = new Set(['Agent', 'Task'])
const MAX_DETAIL = 60
const MAX_STEPS = 8
const TASK_STATUSES = new Set(['pending', 'in_progress', 'completed', 'deleted'])

/** Numbered and bulleted lines of a markdown plan, as plain text for sticky notes. */
export function planSteps(plan: string) {
  return plan
    .split('\n')
    .map((l) => /^\s*(?:\d+[.)]|[-*])\s+(.+)$/.exec(l)?.[1])
    .filter((l): l is string => !!l)
    .map((l) => l.replace(/\*\*|__|`/g, '').trim())
    .filter(Boolean)
    .slice(0, MAX_STEPS)
}

type Payload = Record<string, unknown>

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

export function activityFor(tool: string): Activity {
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

/** Keeps the questions that have text and at least one labelled option; Claude's payload is otherwise trusted only by shape. */
function questionsOf(raw: unknown): Question[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((r): Question[] => {
    const q = (r ?? {}) as Payload
    const options = Array.isArray(q.options) ? q.options.flatMap((o) => (str((o as Payload)?.label) ? [{ label: str((o as Payload).label)!, description: str((o as Payload).description) ?? '' }] : [])) : []
    return str(q.question) && options.length ? [{ question: str(q.question)!, header: str(q.header) ?? '', options, multiSelect: q.multiSelect === true }] : []
  })
}

export function normalize(payload: unknown): RawEvent | null {
  if (!payload || typeof payload !== 'object') return null
  const p = payload as Payload
  const sessionId = str(p.session_id)
  const event = str(p.hook_event_name)
  if (!sessionId || !event) return null
  const subagentId = str(p.agent_id)
  const mode = str(p.permission_mode)
  const activity = (a: Activity, tool?: string, detail?: string): RawEvent => ({
    type: 'activity',
    sessionId,
    ...(subagentId && { subagentId }),
    activity: a,
    ...(tool && { tool }),
    ...(detail && { detail }),
    ...(mode && { mode })
  })
  const input = (p.tool_input && typeof p.tool_input === 'object' ? p.tool_input : {}) as Payload
  const response = (p.tool_response && typeof p.tool_response === 'object' ? p.tool_response : {}) as Payload

  switch (event) {
    case 'PreToolUse': {
      const tool = str(p.tool_name) ?? 'unknown'
      if (tool === 'ExitPlanMode') {
        const plan = str(input.plan) ?? ''
        return { type: 'plan', sessionId, plan, steps: planSteps(plan) }
      }
      if (tool === 'AskUserQuestion') return { type: 'question', sessionId, questions: questionsOf(input.questions) }
      return activity(activityFor(tool), tool, describeTool(p.tool_input))
    }
    case 'PostToolUse': {
      const tool = str(p.tool_name)
      if (tool === 'TaskCreate') {
        const task = (response.task ?? {}) as Payload
        const id = str(task.id)
        return id ? { type: 'task', sessionId, id, subject: str(task.subject) ?? str(input.subject) ?? '', status: 'pending' } : null
      }
      if (tool === 'TaskUpdate') {
        const id = str(response.taskId) ?? str(input.taskId)
        const change = (response.statusChange ?? {}) as Payload
        const status = str(change.to) ?? str(input.status)
        if (!id) return null
        return { type: 'task', sessionId, id, ...(status && TASK_STATUSES.has(status) && { status: status as TaskStatus }), ...(str(input.subject) && { subject: str(input.subject) }) }
      }
      return activity('thinking')
    }
    case 'PreCompact':
      return activity('compacting', undefined, str(p.trigger) === 'manual' ? 'compacting on request' : 'context full, compacting')
    case 'PostCompact':
      return activity(str(p.trigger) === 'manual' ? 'idle' : 'thinking')
    case 'StopFailure':
      return activity('blocked', undefined, (str(p.error_type) ?? 'error').replace(/_/g, ' '))
    case 'UserPromptSubmit':
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
