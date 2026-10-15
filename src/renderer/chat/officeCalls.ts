import type { Row } from './format'
import { parseMcpName } from './mcp'
import type { ToolRun } from './ToolCard'
import type { StepGroup } from './stepGroups'

/** The office's own bookkeeping: library skips and reads, todo changes, shared notes. They are not the agent's work on a project, so a run of them folds into one quiet line. */
const OFFICE_TOOLS = new Set(['library_skip', 'library_get', 'library_index', 'library_search', 'todo_add', 'todo_update', 'todo_done', 'todo_claim', 'todo_get', 'todo_list', 'todo_search', 'remember', 'recall'])
const OFFICE_SERVER = 'agent-world'

export function officeTool(name: string): string | null {
  const m = parseMcpName(name)
  return m && m.server === OFFICE_SERVER && OFFICE_TOOLS.has(m.tool) ? m.tool : null
}

type Call = Extract<Row, { kind: 'tool' }>
export interface OfficeGroup {
  kind: 'office'
  /** The first call's id. */
  id: string
  calls: Call[]
}

/** Runs of office calls between other rows become one group, a single call too. A failed call is left as its own card, so it is not missed. */
export function groupOffice(rows: (Row | StepGroup)[]): (Row | StepGroup | OfficeGroup)[] {
  const out: (Row | StepGroup | OfficeGroup)[] = []
  let run: Call[] = []
  const flush = () => {
    if (run.length) out.push({ kind: 'office', id: run[0]!.id, calls: run })
    run = []
  }
  for (const r of rows) {
    if (r.kind === 'tool' && officeTool(r.run.name) && !r.run.result?.isError) run.push(r)
    else (flush(), out.push(r))
  }
  flush()
  return out
}

export type WhisperKind = 'skip' | 'read' | 'todo' | 'note'
export interface Whisper {
  kind: WhisperKind
  icon: string
  bold: string
  rest: string
  why: string
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : v === undefined || v === null ? '' : String(v))
const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t)
const lines = (t?: string) => (t && t.split('\n').length > 1 ? `${t.split('\n').length} lines` : '')

/** What one call says in a line: what it did, to what, and the thing worth keeping (the reason for a skip, a task's title). */
export function whisperOf(run: ToolRun): Whisper {
  const tool = officeTool(run.name) ?? ''
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
    case 'remember': return { kind: 'note', icon: '✎', bold: 'Noted', rest: clip(str(i.text) || str(i.note), 120), why: '' }
    case 'recall': return { kind: 'note', icon: '⌕', bold: 'Recalled', rest: clip(str(i.query), 80), why: '' }
    default: return { kind: 'todo', icon: '✓', bold: 'Looked through', rest: 'todos', why: '' }
  }
}

export interface SummaryPart {
  area: 'Library' | 'Todo' | 'Notes'
  text: string
}

/** The one line over a run: per area, what was done. A single call is said in full, with its reason. */
export function summaryOf(calls: Call[]): SummaryPart[] {
  const skipped: string[] = []
  const read: string[] = []
  let looked = false
  const tasks = new Map<string, string[]>()
  const notes = new Set<string>()
  const order: SummaryPart['area'][] = []
  const seen = (a: SummaryPart['area']) => order.includes(a) || order.push(a)
  for (const c of calls) {
    const tool = officeTool(c.run.name) ?? ''
    const i = c.run.input as Record<string, unknown>
    if (tool === 'library_skip') (seen('Library'), skipped.push(str(i.id)))
    else if (tool === 'library_get') (seen('Library'), !read.includes(str(i.id)) && read.push(str(i.id)))
    else if (tool === 'library_index' || tool === 'library_search') (seen('Library'), (looked = true))
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
    } else parts.push({ area, text: [...notes].join(' · ') })
  }
  // One call says its reason or title as well.
  if (calls.length === 1 && parts[0]) {
    const w = whisperOf(calls[0]!.run)
    const extra = w.kind === 'note' ? w.rest : w.why
    if (extra) parts[0] = { ...parts[0], text: `${parts[0].text} · ${extra}` }
  }
  return parts
}
