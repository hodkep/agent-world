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
}

export type World = Record<string, AgentState>
export type Role = 'boss' | 'senior' | 'intern'

export const emptyWorld = (): World => ({})

export const roleOf = (a: AgentState): Role => (Object.keys(a.interns).length > 0 ? 'boss' : 'senior')

export function applyEvent(world: World, e: AgentEvent): World {
  const prev = world[e.sessionId] ?? { activity: 'idle', interns: {} }
  const next: AgentState = { ...prev, interns: { ...prev.interns } }

  switch (e.type) {
    case 'activity':
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
      break
  }
  return { ...world, [e.sessionId]: next }
}
