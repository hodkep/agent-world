import type { ModeInfo } from '../../../shared/modes'
import { MODES } from '../../../shared/modes'
import type { LimitWindow } from '../../../shared/types'
import type { LaunchInput } from '../ports'

/** agy's own /context panel shows "Free space: 1.0M" on a Gemini model; the other models it offers are not measured, so their context stays a count of tokens. */
export const agyContextWindow = (model: string): number | null => (/^Gemini\b/.test(model) ? 1_000_000 : null)

/** agy's own names for how much it may do alone, shown like Claude's levels. */
const OWN: Record<string, string> = { default: 'request-review', acceptEdits: 'accept-edits', plan: 'plan', bypassPermissions: 'skip-permissions' }
export const agyModes: ModeInfo[] = MODES.filter((m) => OWN[m.id]).map((m) => ({ ...m, id: OWN[m.id]!, ...(m.id === 'bypassPermissions' && { label: 'Skip permissions' }) }))

/**
 * agy starts a new conversation by itself and names it; once it has, `sessionId` holds that name and a restart picks it up.
 * It has no switch for standing instructions, so the house rules and the job go in as the first message.
 */
/**
 * The models `agy models` lists. Its levels ("(High)", "(Low)") are different models, not a setting, so agy has no thinking
 * level of its own to choose: `efforts` is empty for every one, and the app offers none.
 */
export const agyModels: { value: string; label: string; efforts: string[] }[] = [
  ['gemini-3.8-flash-high', 'Gemini 3.8 Flash (High)'],
  ['gemini-3.8-flash-medium', 'Gemini 3.8 Flash (Medium)'],
  ['gemini-3.8-flash-low', 'Gemini 3.8 Flash (Low)'],
  ['gemini-3.7-flash-high', 'Gemini 3.7 Flash (High)'],
  ['gemini-3.7-flash-medium', 'Gemini 3.7 Flash (Medium)'],
  ['gemini-3.7-flash-low', 'Gemini 3.7 Flash (Low)'],
  ['gemini-3.6-flash-high', 'Gemini 3.6 Flash (High)'],
  ['gemini-3.6-flash-medium', 'Gemini 3.6 Flash (Medium)'],
  ['gemini-3.6-flash-low', 'Gemini 3.6 Flash (Low)'],
  ['gemini-3.1-pro-high', 'Gemini 3.1 Pro (High)'],
  ['gemini-3.1-pro-low', 'Gemini 3.1 Pro (Low)'],
  ['claude-sonnet-4-6', 'Claude Sonnet 4.6 (Thinking)'],
  ['claude-opus-4-6-thinking', 'Claude Opus 4.6 (Thinking)'],
  ['gpt-oss-120b-medium', 'GPT-OSS 120B (Medium)']
].map(([value, label]) => ({ value: value!, label: label!, efforts: [] }))

export function agyArgs(i: LaunchInput) {
  const args: string[] = []
  const o = i.options ?? {}
  // A clone opens the conversation it copies and branches it (see events: /fork); once it has branched, it has its own.
  if (i.agent.started) args.push('--conversation', i.agent.sessionId)
  else if (i.agent.forkOf) args.push('--conversation', i.agent.forkOf)
  if (o.model) {
    // An agent saved while models were listed by family ("gemini-3.8-flash" with a level) keeps working: family and level make the listed name.
    const joined = `${o.model}-${o.effort ?? 'high'}`
    args.push('--model', !agyModels.some((m) => m.value === o.model) && agyModels.some((m) => m.value === joined) ? joined : o.model)
  }
  const mode = (o.permissionMode ?? i.permissionMode) as string | undefined
  if (mode === 'accept-edits' || mode === 'plan') args.push('--mode', mode)
  else if (mode === 'skip-permissions') args.push('--dangerously-skip-permissions')
  // A link to take the session over from a phone or the web; agy takes no name for it.
  if (o.remote) args.push('--remote-control')
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
