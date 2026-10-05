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

const str = (v: unknown) => (typeof v === 'string' ? v : '')

/**
 * agy's tools, under the names the chat already knows how to draw: the chat has one vocabulary (Bash, Read, Glob, WebSearch, Agent,
 * mcp__server__tool…) and each program's transcript is translated into it here, so the same work looks the same whoever did it.
 */
export function toolView(name: string, args: Record<string, unknown>): { name: string; input: Record<string, unknown> } {
  switch (name) {
    case 'run_command':
      return { name: 'Bash', input: { command: args.CommandLine, ...(typeof args.toolAction === 'string' && { description: args.toolAction }) } }
    case 'view_file':
      return { name: 'Read', input: { file_path: str(args.AbsolutePath) || str(args.Path) || str(args.File) } }
    case 'list_dir':
      return { name: 'Glob', input: { pattern: '*', path: str(args.DirectoryPath) } }
    case 'find_by_name':
      return { name: 'Glob', input: { pattern: str(args.Pattern), path: str(args.SearchDirectory) } }
    case 'search_web':
      return { name: 'WebSearch', input: { query: str(args.query) } }
    case 'call_mcp_tool':
      return { name: `mcp__${str(args.ServerName) || 'server'}__${str(args.ToolName) || 'tool'}`, input: args.Arguments && typeof args.Arguments === 'object' ? (args.Arguments as Record<string, unknown>) : {} }
    default:
      return { name, input: args }
  }
}

/** What one call shows in the chat: usually one card, but one call that starts several subagents is one delegation of several. */
export function toolViews(callId: string, name: string, args: Record<string, unknown>): { id: string; name: string; input: Record<string, unknown> }[] {
  if (name !== 'invoke_subagent') return [{ id: callId, ...toolView(name, args) }]
  const asked = Array.isArray(args.Subagents) ? (args.Subagents as { Prompt?: string; Role?: string; TypeName?: string }[]) : []
  return asked.map((a, i) => ({ id: subagentCallId(callId, i), name: 'Agent', input: { description: a.Role ?? (a.Prompt ?? '').replace(/\s+/g, ' ').slice(0, 80), subagent_type: a.TypeName ?? 'subagent', prompt: a.Prompt ?? '' } }))
}

/** The call that started a subagent, as the chat names it: one agy call can start several, so each gets its place in it. */
export const subagentCallId = (callId: string, index: number) => `${callId}:${index}`

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
      for (const v of toolViews(id, text(call.b, '2') ?? 'tool', json(text(call.b, '3')))) items.push({ kind: 'tool', id: `agy:${s.idx}:${v.id}`, at, toolUseId: v.id, name: v.name, input: v.input })
    }
    return items
  }
  if (s.type === TOOL) {
    const toolUseId = text(s.payload, '5.4.1')
    if (!toolUseId) return []
    // Each subagent's answer comes from its own conversation, not from the line saying they were created.
    if (text(s.payload, '5.4.2') === 'invoke_subagent') return []
    const out = text(s.payload, '140.2.1')
    const ok = s.status === 3
    return [{ kind: 'tool-result', id: `agy:${s.idx}`, at, toolUseId, text: ok ? (out ?? '') : (out ?? 'Not run: it was cancelled or refused.'), isError: !ok }]
  }
  return []
}
