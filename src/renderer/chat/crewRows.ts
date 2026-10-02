import type { SubagentInfo } from '../../shared/chat'
import { subagentState } from './format'

/** Claude Code runs at most this many subagents at once (CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS can change it). */
export const CONCURRENT_LIMIT = 20

export interface CrewRow {
  info: SubagentInfo
  /** 0 for one the main agent started, 1 for one that subagent started, and so on. */
  level: number
}

/** A main agent's subagents by start time, each followed by the ones it started itself. None is dropped, whatever its parent. */
export function crewRows(infos: SubagentInfo[]): CrewRow[] {
  const byStart = [...infos].sort((a, b) => a.startedAt - b.startedAt)
  const childOf = new Map<string, SubagentInfo[]>()
  const isChild = new Set<string>()
  for (const parent of byStart)
    for (const call of parent.spawns)
      for (const kid of byStart) if (kid.toolUseId === call && kid !== parent && !isChild.has(kid.agentId)) (isChild.add(kid.agentId), childOf.set(parent.agentId, [...(childOf.get(parent.agentId) ?? []), kid]))
  const out: CrewRow[] = []
  const seen = new Set<string>()
  const walk = (i: SubagentInfo, level: number) => {
    if (seen.has(i.agentId)) return
    seen.add(i.agentId)
    out.push({ info: i, level })
    for (const k of childOf.get(i.agentId) ?? []) walk(k, level + 1)
  }
  for (const i of byStart) if (!isChild.has(i.agentId)) walk(i, 0)
  // Anything left (a loop of parents) still shows.
  for (const i of byStart) walk(i, 0)
  return out
}

export function crewCounts(infos: SubagentInfo[], now: number) {
  const states = infos.map((i) => subagentState(i, now))
  const n = (s: string) => states.filter((x) => x === s).length
  return { working: n('working'), done: n('done'), stopped: n('stopped'), total: infos.length, limit: CONCURRENT_LIMIT }
}

const name = (i: SubagentInfo) => `${i.type} “${i.description}”`

/** The app cannot kill one subagent itself: it asks the main agent, which has the tool for it. */
export const stopRequestText = (i: SubagentInfo) => `Please stop the subagent ${name(i)} (agent id ${i.agentId}) with the TaskStop tool, and leave the others running.`

/** What goes into the message box as a quote, so the question that follows is clearly about this subagent. */
export const followUpText = (i: SubagentInfo) => `Subagent ${name(i)} (agent id ${i.agentId})`
