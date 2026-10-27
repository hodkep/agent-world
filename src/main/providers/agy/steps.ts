import { agyCalls, subagentCallId } from './toolTable'
import type { ChatItem } from '../../../shared/chat'
import type { UsageRecord } from '../../../shared/tokens'
import { all, num, text } from './wire'

export interface StepRow {
  idx: number
  type: number
  status: number
  payload: Buffer | null
}

// Step kinds seen in agy 1.2.x conversation files; the format is undocumented, so a step of any other kind adds nothing.
const USER = 14
const MODEL = 15
const TOOL = 132
/** Statuses of a finished step: 3 done, 6 cancelled, 7 refused. Others are still being worked on. */
export { subagentCallId }
export const FINISHED = new Set([3, 6, 7])
/** The first message the app sends carries the house rules; it is ours, not something the user said. */
const OURS = 'House rules for this session.'

export const stepTime = (payload: Buffer | null) => {
  const s = num(payload, '5.1.1')
  return s === undefined ? 0 : s * 1000 + Math.round((num(payload, '5.1.2') ?? 0) / 1e6)
}

export const json = (s: string | undefined): Record<string, unknown> => {
  try {
    const v: unknown = JSON.parse(s ?? '')
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** One step's calls in the chat's vocabulary (see toolTable.ts). */
export const toolView = (name: string, args: Record<string, unknown>) => agyCalls.translate({ id: '', name, args })[0]!

export interface StepUsage {
  /** Everything it read for this step, what came from cache included. */
  input: number
  /** Everything it wrote: its thinking and its reply. */
  output: number
  thinking: number
}

/**
 * The token counts of a model step. The file is undocumented; these fields were matched against what agy itself draws ("Thought for 12s,
 * 3.5k tokens" is field 9, and field 3 is always field 9 plus field 10). What was read is field 2 plus the cached part in field 5.
 */
export function usageOf(payload: Buffer | null): StepUsage | null {
  const read = num(payload, '5.9.2')
  const wrote = num(payload, '5.9.3')
  if (read === undefined || wrote === undefined) return null
  return { input: read + (num(payload, '5.9.5') ?? 0), output: wrote, thinking: num(payload, '5.9.9') ?? 0 }
}

/**
 * The requests agy made after step `after`, one record per finished model step, and the number of the last step looked at, to continue from.
 * `input` is what it read fresh (field 2) and `cacheRead` what it read from its cache (field 5); agy never says what it wrote to the cache.
 * Reading stops at the first step still being worked on, so a step is counted once, whole.
 */
export function usageRequests(rows: StepRow[], after: number, model: string): { records: UsageRecord[]; cursor: number } {
  const records: UsageRecord[] = []
  let cursor = after
  for (const r of rows) {
    if (r.idx <= after) continue
    if (!FINISHED.has(r.status)) break
    cursor = r.idx
    const input = num(r.payload, '5.9.2')
    const output = num(r.payload, '5.9.3')
    if (r.type === MODEL && input !== undefined && output !== undefined) records.push({ id: String(r.idx), at: stepTime(r.payload), model, input, cacheRead: num(r.payload, '5.9.5') ?? 0, output })
  }
  return { records, cursor }
}

/** A conversation's totals, and how much the last step held (what it read plus what it wrote): roughly how full its context is. */
export function sumUsage(steps: (StepUsage | null)[]): { input: number; output: number; context: number } | null {
  const used = steps.filter((s): s is StepUsage => !!s)
  if (!used.length) return null
  const last = used.at(-1)!
  return { input: used.reduce((n, s) => n + s.input, 0), output: used.reduce((n, s) => n + s.output, 0), context: last.input + last.output }
}

/** One step of a conversation as chat items: what was said, thought and run. */
export function decodeStep(s: StepRow): ChatItem[] {
  const at = stepTime(s.payload)
  if (s.type === USER) {
    const t = text(s.payload, '19.2')?.trim()
    return t && !t.startsWith(OURS) ? [{ kind: 'user', id: `agy:${s.idx}`, at, text: t }] : []
  }
  if (s.type === MODEL) {
    const items: ChatItem[] = []
    if (text(s.payload, '20.3')?.trim()) items.push({ kind: 'thinking', id: `agy:${s.idx}:think`, at })
    const say = text(s.payload, '20.1')?.trim()
    if (say) items.push({ kind: 'assistant', id: `agy:${s.idx}:say`, at, text: say })
    for (const call of all(s.payload, '20.7')) {
      const id = text(call.b, '1') ?? ''
      for (const v of agyCalls.translate({ id, name: text(call.b, '2') ?? 'tool', args: json(text(call.b, '3')) })) items.push({ kind: 'tool', id: `agy:${s.idx}:${v.id}`, at, toolUseId: v.id, name: v.name, input: v.input })
    }
    return items
  }
  if (s.type === TOOL) {
    const toolUseId = text(s.payload, '5.4.1')
    if (!toolUseId) return []
    // Each subagent's answer comes from its own conversation, not from the line saying they were created.
    if (agyCalls.silentResult(text(s.payload, '5.4.2') ?? '')) return []
    const out = text(s.payload, '140.2.1')
    const ok = s.status === 3
    return [{ kind: 'tool-result', id: `agy:${s.idx}`, at, toolUseId, text: ok ? (out ?? '') : (out ?? 'Not run: it was cancelled or refused.'), isError: !ok }]
  }
  return []
}
