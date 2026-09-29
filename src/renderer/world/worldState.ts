import type { Activity, AgentEvent } from '../../shared/types'

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
}

/** Keyed by agent id: an agent's Claude session id changes on /clear, its identity does not. */
export type World = Record<string, AgentState>
export type Role = 'boss' | 'senior' | 'intern'
export type Place = 'desk' | 'intern' | 'lounge' | 'gone'

const FILE_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit'])

/** Active agents work at their desk, finished ones rest in the lounge, dead sessions leave the office. */
export function placeFor(activity: Activity, intern: boolean): Place {
  if (intern) return 'intern'
  if (activity === 'asleep') return 'gone'
  if (activity === 'idle' || activity === 'waiting') return 'lounge'
  return 'desk'
}

export const emptyWorld = (): World => ({})

export const roleOf = (a: AgentState): Role => (Object.keys(a.interns).length > 0 ? 'boss' : 'senior')

export function applyEvent(world: World, e: AgentEvent): World {
  const prev = world[e.agentId] ?? { activity: 'idle', interns: {}, files: 0 }
  const next: AgentState = { ...prev, interns: { ...prev.interns } }

  switch (e.type) {
    case 'activity':
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
