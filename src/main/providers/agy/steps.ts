import type { ChatItem } from '../../../shared/chat'
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
export const FINISHED = new Set([3, 6, 7])
/** The first message the app sends carries the house rules; it is ours, not something the user said. */
const OURS = 'House rules for this session.'

const ms = (payload: Buffer | null) => {
  const s = num(payload, '5.1.1')
  return s === undefined ? 0 : s * 1000 + Math.round((num(payload, '5.1.2') ?? 0) / 1e6)
}

const json = (s: string | undefined): Record<string, unknown> => {
  try {
    const v: unknown = JSON.parse(s ?? '')
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** agy's tools, under the names the chat already knows how to draw. */
function tool(name: string, args: Record<string, unknown>): { name: string; input: Record<string, unknown> } {
  if (name === 'run_command') return { name: 'Bash', input: { command: args.CommandLine, ...(typeof args.toolAction === 'string' && { description: args.toolAction }) } }
  return { name, input: args }
}

/** One step of a conversation as chat items: what was said, thought and run. */
export function decodeStep(s: StepRow): ChatItem[] {
  const at = ms(s.payload)
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
      const t = tool(text(call.b, '2') ?? 'tool', json(text(call.b, '3')))
      items.push({ kind: 'tool', id: `agy:${s.idx}:${id}`, at, toolUseId: id, ...t })
    }
    return items
  }
  if (s.type === TOOL) {
    const toolUseId = text(s.payload, '5.4.1')
    if (!toolUseId) return []
    const out = text(s.payload, '140.2.1')
    const ok = s.status === 3
    return [{ kind: 'tool-result', id: `agy:${s.idx}`, at, toolUseId, text: ok ? (out ?? '') : (out ?? 'Not run: it was cancelled or refused.'), isError: !ok }]
  }
  return []
}
