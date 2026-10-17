import type { Row } from './format'
import { humanize, parseMcpName } from './mcp'
import type { ToolRun } from './ToolCard'
import type { StepGroup } from './stepGroups'

const OFFICE_SERVER = 'agent-world'
/** The office's tools that have a card of their own (messages and subagents): they are the agent's dealings with others, not bookkeeping. */
const OWN_CARD = new Set(['send_message', 'list_agents', 'spawn_subagent', 'await_subagents', 'stop_subagent'])
/** The calls that move a run along: the track above the chat shows them, so the chat does not. */
const RUN_TOOLS = new Set(['task_begin', 'task_done', 'step_done', 'plan_submit'])

export function runCall(name: string): boolean {
  const m = parseMcpName(name)
  return !!m && m.server === OFFICE_SERVER && RUN_TOOLS.has(m.tool)
}

/**
 * The office's own bookkeeping: every tool of its server except those with a card of their own and the calls that move a run (library skips and reads, todo
 * changes, notes, the builder's workflow tools, and any the office adds later). They are not the agent's work on a project, so a run of them folds into one quiet line.
 */
export function officeTool(name: string): string | null {
  const tool = agentWorldTool(name)
  return tool && !RUN_TOOLS.has(tool) ? tool : null
}

/** Any tool of the office's server except those with a card of their own: the office's bookkeeping, and the calls that move a run. */
function agentWorldTool(name: string): string | null {
  const m = parseMcpName(name)
  return m && m.server === OFFICE_SERVER && !OWN_CARD.has(m.tool) ? m.tool : null
}

type Call = Extract<Row, { kind: 'tool' }>
export interface OfficeGroup {
  kind: 'office'
  /** The first call's id. */
  id: string
  calls: Call[]
}

/**
 * Runs of office calls between other rows become one group, a single call too. A failed call is in the group as a red stamp, with its reason in the tip and its card
 * one click away. The calls that move a run leave the chat altogether (the track shows them), unless one failed.
 */
export function groupOffice(rows: (Row | StepGroup)[]): (Row | StepGroup | OfficeGroup)[] {
  const out: (Row | StepGroup | OfficeGroup)[] = []
  let run: Call[] = []
  const flush = () => {
    if (run.length) out.push({ kind: 'office', id: run[0]!.id, calls: run })
    run = []
  }
  for (const r of rows) {
    if (r.kind === 'tool' && runCall(r.run.name) && !r.run.result?.isError) continue
    if (r.kind === 'tool' && agentWorldTool(r.run.name)) run.push(r)
    else (flush(), out.push(r))
  }
  flush()
  return out
}

export type WhisperKind = 'skip' | 'read' | 'todo' | 'note' | 'workflow' | 'other'
export interface Whisper {
  kind: WhisperKind
  icon: string
  bold: string
  rest: string
  why: string
}

/** What each call that moves a run says in a line: a run is the workflow's word, a task is a todo's. */
const RUN_WORDS: Record<string, string> = { task_begin: 'began run', plan_submit: 'plan sent', step_done: 'step reported', task_done: 'run finished' }
const str = (v: unknown) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : v === undefined || v === null ? '' : String(v))
const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t)
const lines = (t?: string) => (t && t.split('\n').length > 1 ? `${t.split('\n').length} lines` : '')

/** What one call says in a line: what it did, to what, and the thing worth keeping (the reason for a skip, a task's title). */
export function whisperOf(run: ToolRun): Whisper {
  const w = said(run)
  const why = run.result?.isError ? `failed: ${(run.result.text ?? '').split('\n')[0]!.trim()}` : ''
  return why ? { ...w, why: clip(why, 140) } : w
}

function said(run: ToolRun): Whisper {
  const tool = agentWorldTool(run.name) ?? ''
  const i = run.input as Record<string, unknown>
  const out = run.result?.text
  const task = `todo#${str(i.id)}`
  switch (tool) {
    case 'library_skip': return { kind: 'skip', icon: '⊘', bold: 'Skipped', rest: str(i.id), why: clip(str(i.reason), 140) }
    case 'library_get': return { kind: 'read', icon: '▤', bold: 'Read', rest: str(i.id), why: lines(out) }
    case 'library_index': return { kind: 'read', icon: '▤', bold: 'Looked at', rest: 'the library', why: '' }
    case 'library_search': return { kind: 'read', icon: '▤', bold: 'Searched', rest: 'the library', why: clip(str(i.query), 80) }
    case 'todo_add': return { kind: 'todo', icon: '＋', bold: 'Added', rest: clip(str(i.title), 90), why: str(i.list) }
    case 'todo_update': return { kind: 'todo', icon: '✓', bold: task, rest: '', why: clip(str(i.title) || (i.status ? str(i.status) : 'updated'), 90) }
    case 'todo_done': return { kind: 'todo', icon: '✓', bold: task, rest: '', why: clip(['done', str(i.note)].filter(Boolean).join(' · '), 120) }
    case 'todo_claim': return { kind: 'todo', icon: '✓', bold: task, rest: '', why: 'claimed' }
    case 'todo_get': return { kind: 'todo', icon: '✓', bold: task, rest: '', why: 'looked at' }
    case 'todo_search': return { kind: 'todo', icon: '✓', bold: 'Searched', rest: 'todos', why: clip(str(i.query), 80) }
    case 'todo_list': return { kind: 'todo', icon: '✓', bold: 'Looked through', rest: 'todos', why: '' }
    case 'remember': return { kind: 'note', icon: '✎', bold: 'Noted', rest: clip(str(i.text) || str(i.note), 120), why: '' }
    case 'recall': return { kind: 'note', icon: '⌕', bold: 'Recalled', rest: clip(str(i.query), 80), why: '' }
    case 'task_begin': return { kind: 'workflow', icon: '⚑', bold: 'Began run', rest: clip(str(i.title), 90), why: '' }
    case 'plan_submit': return { kind: 'workflow', icon: '⚑', bold: 'Sent', rest: 'the plan', why: '' }
    case 'step_done': return { kind: 'workflow', icon: '⚑', bold: 'Reported step', rest: str(i.step), why: '' }
    case 'task_done': return { kind: 'workflow', icon: '⚑', bold: 'Finished run', rest: '', why: clip(str(i.summary), 120) }
    case 'workflow_list': return { kind: 'workflow', icon: '⚑', bold: 'Looked at', rest: 'workflows', why: '' }
    case 'workflow_get': return { kind: 'workflow', icon: '⚑', bold: 'Read', rest: `workflow ${str(i.id)}`, why: '' }
    case 'workflow_history': return { kind: 'workflow', icon: '⚑', bold: 'Read', rest: `the history of workflow ${str(i.id)}`, why: '' }
    case 'workflow_propose': return { kind: 'workflow', icon: '⚑', bold: 'Proposed', rest: proposedId(i.file), why: '' }
    default: return { kind: 'other', icon: '·', bold: humanize(tool), rest: '', why: '' }
  }
}

/** The id inside a proposed workflow file, or a plain word when the text is not a workflow. */
function proposedId(file: unknown): string {
  try {
    const id = (JSON.parse(typeof file === 'string' ? file : '') as { id?: unknown }).id
    return typeof id === 'string' && id ? id : 'a workflow'
  } catch {
    return 'a workflow'
  }
}

export type StampKind = 'library' | 'todo' | 'note' | 'flag' | 'plan'
export interface Stamp {
  kind: StampKind
  /** The few words beside the picture; none when the picture says it. */
  label: string
  /** What the call was, for the tip over the stamp. */
  tip: string
  /** `skip`: a library rule passed over, shown quieter; `wait`: the call is still running; `bad`: the call failed. */
  state: '' | 'skip' | 'wait' | 'bad'
}

/** One office call as a stamp: a picture for its area, a few words, and the whole sentence for the tip. */
export function stampOf(run: ToolRun, working = false): Stamp {
  const tool = agentWorldTool(run.name) ?? ''
  const i = run.input as Record<string, unknown>
  const w = whisperOf(run)
  const tip = `${[w.bold, w.rest].filter(Boolean).join(' ')}${w.why ? ` · ${w.why}` : ''}`
  const state: Stamp['state'] = run.result?.isError ? 'bad' : tool === 'library_skip' ? 'skip' : !run.result && working ? 'wait' : ''
  const id = str(i.id)
  if (tool.startsWith('library_')) return { kind: 'library', label: { library_skip: `skip ${id}`, library_get: id, library_index: 'library', library_search: 'searched' }[tool] ?? '', tip, state }
  if (tool === 'todo_add') return { kind: 'todo', label: clip(str(i.title), 14), tip, state }
  if (tool.startsWith('todo_')) return { kind: 'todo', label: id ? `#${id}` : 'todos', tip, state }
  if (tool === 'remember' || tool === 'recall') return { kind: 'note', label: tool === 'remember' ? 'noted' : 'recalled', tip, state }
  if (tool === 'workflow_propose') return { kind: 'plan', label: 'proposed', tip, state }
  if (tool === 'plan_submit') return { kind: 'plan', label: 'plan', tip, state }
  const flagged: Record<string, string> = { workflow_list: 'workflows', workflow_get: id, workflow_history: id, task_begin: 'run', task_done: 'run done', step_done: str(i.step) ? `step ${str(i.step)}` : 'step' }
  return { kind: 'flag', label: flagged[tool] ?? clip(humanize(tool), 14), tip, state }
}

export interface SummaryPart {
  area: 'Library' | 'Todo' | 'Notes' | 'Workflow'
  text: string
}

/** The one line over a run: per area, what was done. A single call is said in full, with its reason. */
export function summaryOf(calls: Call[]): SummaryPart[] {
  const skipped: string[] = []
  const read: string[] = []
  let looked = false
  const tasks = new Map<string, string[]>()
  const notes = new Set<string>()
  const flows = new Set<string>()
  const order: SummaryPart['area'][] = []
  const seen = (a: SummaryPart['area']) => order.includes(a) || order.push(a)
  for (const c of calls) {
    const tool = agentWorldTool(c.run.name) ?? ''
    const i = c.run.input as Record<string, unknown>
    if (tool === 'library_skip') (seen('Library'), skipped.push(str(i.id)))
    else if (tool === 'library_get') (seen('Library'), !read.includes(str(i.id)) && read.push(str(i.id)))
    else if (tool === 'library_index' || tool === 'library_search') (seen('Library'), (looked = true))
    else if (RUN_TOOLS.has(tool)) (seen('Workflow'), flows.add(RUN_WORDS[tool]!))
    else if (tool.startsWith('workflow_')) (seen('Workflow'), flows.add(tool === 'workflow_propose' ? 'proposed' : tool === 'workflow_get' || tool === 'workflow_history' ? 'read' : 'looked'))
    else if (tool === 'remember') (seen('Notes'), notes.add('noted'))
    else if (tool === 'recall') (seen('Notes'), notes.add('recalled'))
    else if (tool.startsWith('todo_')) {
      seen('Todo')
      const key = tool === 'todo_add' ? `“${clip(str(i.title), 28)}”` : tool.endsWith('search') || tool.endsWith('list') ? '' : `#${str(i.id)}`
      const verb = { todo_add: 'added', todo_update: i.status === 'blocked' ? 'blocked' : 'updated', todo_done: 'done', todo_claim: 'claimed', todo_get: 'looked at', todo_list: 'looked through', todo_search: 'looked through' }[tool] ?? 'updated'
      const have = tasks.get(key) ?? []
      if (!have.includes(verb)) tasks.set(key, [...have, verb])
    }
  }
  const parts: SummaryPart[] = []
  for (const area of order) {
    if (area === 'Library') {
      const bits = [skipped.length ? (skipped.length === 1 ? `skipped ${skipped[0]}` : `skipped ${skipped.length}`) : '', read.length ? (read.length <= 2 ? `read ${read.join(', ')}` : `read ${read.length}`) : '', looked && !skipped.length && !read.length ? 'looked around' : ''].filter(Boolean)
      parts.push({ area, text: bits.join(' · ') })
    } else if (area === 'Todo') {
      parts.push({ area, text: [...tasks].map(([k, v]) => `${k ? `${k} ` : ''}${v.join(', ')}`).join('; ') })
    } else if (area === 'Workflow') parts.push({ area, text: [...flows].join(' · ') })
    else parts.push({ area, text: [...notes].join(' · ') })
  }
  // One call says its reason or title as well.
  if (calls.length === 1 && parts[0]) {
    const w = whisperOf(calls[0]!.run)
    const extra = w.kind === 'note' ? w.rest : w.why
    if (extra && !parts[0].text.includes(extra)) parts[0] = { ...parts[0], text: `${parts[0].text} · ${extra}` }
  }
  return parts
}

export type FoldArea = 'Workflow' | 'Todos' | 'Library' | 'Notes' | 'Other'
export interface AreaRow {
  area: FoldArea
  /** What was done there, in words. */
  text: string
  calls: Call[]
  /** How many of the calls failed. */
  bad: number
  /** Whether a call is still running. */
  running: boolean
}

function areaOfCall(c: Call): FoldArea {
  const tool = agentWorldTool(c.run.name) ?? ''
  if (tool.startsWith('library_')) return 'Library'
  if (tool.startsWith('todo_')) return 'Todos'
  if (tool === 'remember' || tool === 'recall') return 'Notes'
  if (RUN_TOOLS.has(tool) || tool.startsWith('workflow_')) return 'Workflow'
  return 'Other'
}

/** The fold as a row for each area, in the order the areas first appear, so a todo and a workflow call are never told as one thing. */
export function areasOf(calls: Call[], working = false): AreaRow[] {
  const buckets = new Map<FoldArea, Call[]>()
  for (const c of calls) {
    const area = areaOfCall(c)
    buckets.set(area, [...(buckets.get(area) ?? []), c])
  }
  return [...buckets].map(([area, cs]) => ({
    area,
    text: area === 'Other' ? [...new Set(cs.map((c) => humanize(agentWorldTool(c.run.name) ?? '')))].join(' · ') : (summaryOf(cs)[0]?.text ?? ''),
    calls: cs,
    bad: cs.filter((c) => c.run.result?.isError).length,
    running: working && cs.some((c) => !c.run.result)
  }))
}

const OUTCOME_LINES = 4
const OUTCOME_WIDTH = 240

/** What a call brought back, for its opened row: the first few lines of the result and how many more there are; nothing for a failed call, whose reason the row already has. */
export function outcomeOf(run: ToolRun): { text: string; more: number } | null {
  if (!run.result || run.result.isError) return null
  const all = (run.result.text ?? '').split('\n').map((l) => l.trimEnd())
  const lines = all.filter((l) => l.trim())
  if (lines.length === 0) return null
  return { text: lines.slice(0, OUTCOME_LINES).map((l) => clip(l, OUTCOME_WIDTH)).join('\n'), more: Math.max(0, lines.length - OUTCOME_LINES) }
}
