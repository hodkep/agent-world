import type { Activity, AgentEvent, Question, TaskStatus } from '../../shared/types'

export interface InternState {
  type: string
  activity: Activity
  detail?: string
}

export interface AgentState {
  activity: Activity
  detail?: string
  interns: Record<string, InternState>
  /** Files written or edited this session, by the agent or its interns: the paper pile on its desk. */
  files: number
  /** Claude permission mode last reported ('plan' sends the agent to the whiteboard). */
  mode?: string
  /** Latest plan awaiting or past review, and its steps for the whiteboard. */
  plan?: string | null
  planSteps?: string[]
  /** Questions Claude last asked with AskUserQuestion. */
  questions?: Question[]
  tasks?: Task[]
  /** Claude's session id; when it changes (/clear) the session-scoped plan and tasks start over. */
  sessionId?: string
}

export interface Task {
  id: string
  subject: string
  status: Exclude<TaskStatus, 'deleted'>
}

/** Keyed by agent id: an agent's Claude session id changes on /clear, its identity does not. */
export type World = Record<string, AgentState>
export type Role = 'boss' | 'senior' | 'intern'
export type Place = 'desk' | 'intern' | 'lounge' | 'whiteboard' | 'shelf' | 'gone'

const FILE_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit'])

/** Active agents work at their desk, finished ones rest in the lounge, dead sessions leave the office. */
export function placeFor(activity: Activity, intern: boolean, mode?: string, reading = false): Place {
  if (intern) return 'intern'
  if (activity === 'asleep') return 'gone'
  if (activity === 'idle' || activity === 'waiting' || activity === 'blocked') return 'lounge'
  // Reading something from the library takes a working agent to the bookshelf for a moment.
  if (reading) return 'shelf'
  // Planning happens at the whiteboard, including presenting the plan for review.
  if (mode === 'plan') return 'whiteboard'
  return 'desk'
}

/** What the pill over an agent at the bookshelf says: short, because it is drawn on the pixel grid above one desk. */
export const readingCaption = (item: string) => `read ${item}`.slice(0, 20)

export const emptyWorld = (): World => ({})

export const roleOf = (a: AgentState): Role => (Object.keys(a.interns).length > 0 ? 'boss' : 'senior')

export function applyEvent(world: World, e: AgentEvent): World {
  const prev = world[e.agentId] ?? { activity: 'idle', interns: {}, files: 0 }
  const next: AgentState = { ...prev, interns: { ...prev.interns }, sessionId: e.sessionId }
  if (prev.sessionId && prev.sessionId !== e.sessionId) {
    next.tasks = []
    next.plan = null
    next.questions = []
    next.planSteps = []
  }

  switch (e.type) {
    case 'question':
      next.questions = e.questions
      break
    case 'mode':
      next.mode = e.mode
      break
    case 'plan':
      next.plan = e.plan
      next.planSteps = e.steps
      break
    case 'task': {
      const tasks = [...(next.tasks ?? [])]
      const i = tasks.findIndex((t) => t.id === e.id)
      if (e.status === 'deleted') {
        if (i >= 0) tasks.splice(i, 1)
      } else if (i >= 0) tasks[i] = { ...tasks[i]!, ...(e.subject && { subject: e.subject }), ...(e.status && { status: e.status }) }
      else tasks.push({ id: e.id, subject: e.subject ?? `task ${e.id}`, status: e.status ?? 'pending' })
      next.tasks = tasks
      break
    }
    case 'activity':
      if (e.mode && !e.subagentId) next.mode = e.mode
      if (e.activity === 'implementing' && e.tool && FILE_TOOLS.has(e.tool)) next.files = prev.files + 1
      if (e.subagentId) next.interns[e.subagentId] = { type: prev.interns[e.subagentId]?.type ?? 'agent', activity: e.activity, detail: e.detail }
      else {
        next.activity = e.activity
        next.detail = e.detail
      }
      break
    case 'subagent-start':
      next.interns[e.subagentId] = { type: e.subagentType, activity: 'thinking' }
      break
    case 'subagent-stop':
      delete next.interns[e.subagentId]
      break
    case 'session-end':
      next.activity = 'asleep'
      next.detail = undefined
      next.interns = {}
      next.files = 0
      break
  }
  return { ...world, [e.agentId]: next }
}
