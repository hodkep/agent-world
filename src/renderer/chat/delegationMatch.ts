import type { SubagentInfo } from '../../shared/chat'

interface Call {
  toolUseId: string
  description: string
  subagentType: string
}

/**
 * Which subagent each call in a delegation started. Claude's own are named by the call; one started through the office is not
 * (the program does not say which call made it), so it is matched by its task and program, one subagent to a call, oldest first.
 */
export function pairSubagents(calls: Call[], infos: SubagentInfo[]): Map<string, SubagentInfo> {
  const out = new Map<string, SubagentInfo>()
  const claimed = new Set<string>()
  for (const c of calls) {
    const own = infos.find((i) => i.toolUseId === c.toolUseId)
    if (own) (out.set(c.toolUseId, own), claimed.add(own.agentId))
  }
  for (const c of calls) {
    if (out.has(c.toolUseId)) continue
    const made = infos.find((i) => i.toolUseId.startsWith('spawn:') && !claimed.has(i.agentId) && i.description === c.description && i.type === c.subagentType)
    if (made) (out.set(c.toolUseId, made), claimed.add(made.agentId))
  }
  return out
}
