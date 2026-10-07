import type { SubagentInfo } from '../../shared/chat'
import { subagentState } from './format'

const str = (v: unknown) => (typeof v === 'string' ? v : '')

/** The subagent an id names: the whole id, or the short start Claude prints in its replies (at least 6 characters). */
export function findSubagent(infos: SubagentInfo[], to: string): SubagentInfo | null {
  if (!to) return null
  const exact = infos.find((i) => i.agentId === to)
  if (exact) return exact
  return to.length < 6 ? null : (infos.find((i) => i.agentId.startsWith(to) || to.startsWith(i.agentId)) ?? null)
}

export interface SendCard {
  label: 'To subagent' | 'To agent'
  name: string
  summary: string
  body: string
  tag: string
  /** How the tag is coloured: go (cyan), ok (green), bad (red), wait (plain). */
  tone: 'go' | 'ok' | 'bad' | 'wait'
  route: string
}

function answerOf(text: string): { success?: boolean; message?: string; error?: string; resumedAgentId?: string } {
  try {
    const v = JSON.parse(text)
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

/** A SendMessage call as a card: who it went to, what it said, and what became of it. */
export function sendMessageCard(input: Record<string, unknown>, result: { text: string; isError: boolean } | undefined, infos: SubagentInfo[]): SendCard {
  const to = str(input.to)
  const sub = findSubagent(infos, to)
  // An id that looks like a subagent's but is not among the known ones is still a subagent, named by its short id.
  const isSub = !!sub || /^[0-9a-f]{12,}$/i.test(to)
  const short = (sub?.agentId ?? to).slice(0, 7)
  const base = { label: (isSub ? 'To subagent' : 'To agent') as SendCard['label'], name: sub ? `${sub.type} · ${sub.description}` : isSub ? short : to, summary: str(input.summary), body: str(input.message) }
  if (!result) return { ...base, tag: 'Sending…', tone: 'wait', route: isSub ? short : '' }
  const answer = answerOf(result.text)
  if (result.isError || answer.success === false) return { ...base, tag: 'Not delivered', tone: 'bad', route: (answer.error ?? answer.message ?? (result.isError ? result.text : '') ?? '').slice(0, 120) }
  if (answer.resumedAgentId) return { ...base, tag: 'Woke it up', tone: 'go', route: `${short} · it had finished and is working again` }
  return { ...base, tag: 'Delivered', tone: 'ok', route: isSub ? `${short} · it reads it at its next step` : `to “${to}”` }
}

export type Reaction = { kind: 'present'; id: string } | { kind: 'wake'; id: string; type: string } | { kind: 'none' }

/** What the office does when a message goes to `to`: an envelope to a subagent that is there, or bringing back one that left. */
export function reactTo(to: string, shown: string[], infos: SubagentInfo[]): Reaction {
  const sub = findSubagent(infos, to)
  if (!sub) return { kind: 'none' }
  return shown.includes(sub.agentId) ? { kind: 'present', id: sub.agentId } : { kind: 'wake', id: sub.agentId, type: sub.type }
}

/** How long after it was sent away a subagent's file must show new work before it counts as having come back. */
const RETURN_MS = 2000

/**
 * Subagents the office sent away (`stoppedAt`, by id) whose own file shows them working again, and that the office does not
 * show: they were woken by a message without Claude saying so.
 */
export function resumedUnseen(infos: SubagentInfo[], shown: string[], stoppedAt: Map<string, number>, now: number): SubagentInfo[] {
  return infos.filter((i) => {
    const at = stoppedAt.get(i.agentId)
    return at !== undefined && !shown.includes(i.agentId) && subagentState(i, now) === 'working' && i.updatedAt > at + RETURN_MS
  })
}
