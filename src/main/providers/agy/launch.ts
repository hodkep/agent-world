import type { ModeInfo } from '../../../shared/modes'
import { MODES } from '../../../shared/modes'
import type { LimitWindow } from '../../../shared/types'
import type { LaunchInput } from '../ports'

/** agy's own /context panel shows "Free space: 1.0M" on a Gemini model; the other models it offers are not measured, so their context stays a count of tokens. */
export const agyContextWindow = (model: string): number | null => (/^Gemini\b/.test(model) ? 1_000_000 : null)

/** agy's own names for how much it may do alone, shown like Claude's levels. */
const OWN: Record<string, string> = { default: 'request-review', acceptEdits: 'accept-edits', plan: 'plan', bypassPermissions: 'skip-permissions' }
export const agyModes: ModeInfo[] = MODES.filter((m) => OWN[m.id]).map((m) => ({ ...m, id: OWN[m.id]! }))

/**
 * agy starts a new conversation by itself and names it; once it has, `sessionId` holds that name and a restart picks it up.
 * It has no switch for standing instructions, so the house rules and the job go in as the first message.
 */
export function agyArgs(i: LaunchInput) {
  const args: string[] = []
  const o = i.options ?? {}
  // A clone opens the conversation it copies and branches it (see events: /fork); once it has branched, it has its own.
  if (i.agent.started) args.push('--conversation', i.agent.sessionId)
  else if (i.agent.forkOf) args.push('--conversation', i.agent.forkOf)
  if (o.model) args.push('--model', o.model)
  if (o.effort) args.push('--effort', o.effort)
  const mode = (o.permissionMode ?? i.permissionMode) as string | undefined
  if (mode === 'accept-edits' || mode === 'plan') args.push('--mode', mode)
  else if (mode === 'skip-permissions') args.push('--dangerously-skip-permissions')
  for (const d of i.addDirs ?? []) args.push('--add-dir', d)
  const instructions = [i.houseRules, o.instructions].map((t) => t?.trim()).filter(Boolean).join('\n\n')
  if (!i.agent.started && instructions) args.push('-i', `House rules for this session. Keep them in mind; reply only "ok" now.\n\n${instructions}`)
  return args
}

/** `agy -p "/usage"` prints one tab-separated line per window: group, "Weekly|Five Hour Limit Remaining", percent, reset time. */
export function parseUsage(out: string): LimitWindow[] {
  return out.split('\n').flatMap((line): LimitWindow[] => {
    const [group, what, pct, resetsAt] = line.split('\t').map((c) => c.trim())
    const m = /^(Weekly|Five Hour) Limit Remaining$/.exec(what ?? '')
    const n = Number.parseFloat(pct ?? '')
    if (!group || !m || !resetsAt || Number.isNaN(n)) return []
    return [{ provider: 'agy', group, kind: m[1] === 'Weekly' ? 'weekly' : 'five_hour', remainingPct: n, resetsAt }]
  })
}
