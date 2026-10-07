import { jobId, monitorTask } from './watch'
import type { ChatItem, HookInfo, NoteEvent, SubagentInfo } from '../../shared/chat'
import { type ParsedHandoff, parseHandoff } from '../../shared/handoff'
import type { ToolRun } from './ToolCard'

export type Row =
  | { kind: 'user'; id: string; text: string; /** When it was sent (not set on one still sending). */ at?: number; pending?: boolean; queued?: boolean }
  | { kind: 'image'; id: string; src: string }
  | { kind: 'shell'; id: string; command: string; out?: { stdout: string; stderr: string } }
  | { kind: 'command'; id: string; name: string; args: string }
  | { kind: 'assistant'; id: string; text: string; /** Seconds the turn took, when it took a while. */ took?: number; /** What hooks told the agent just before this reply, which is why it was written. */ hooks?: HookInfo[] }
  | { kind: 'thinking'; id: string; /** Seconds it spent, when that is worth saying. */ took?: number }
  | { kind: 'tool'; id: string; run: ToolRun }
  /** The subagents one reply started, together; their progress comes from Claude's own files for them. */
  | { kind: 'delegation'; id: string; calls: { toolUseId: string; description: string; subagentType: string }[] }
  /** The report a subagent handed back when it finished. */
  | { kind: 'report'; id: string; agentId: string; body: string }
  | NoteRow
  /** System events that came one after another, drawn as a row of chips. */
  | { kind: 'events'; id: string; chips: NoteRow[] }
  /** Work this agent handed to another. */
  | { kind: 'handoff-out'; id: string; to: string; status: 'queued' | 'delivered' | 'dropped'; handoff: ParsedHandoff; text: string }

/** A note: a plain line, or (with an event kind) one chip of a system event. */
export interface NoteRow {
  kind: 'note'
  id: string
  text: string
  detail?: string
  detailLabel?: string
  hook?: HookInfo
  event?: NoteEvent
  tone?: 'bad'
  /** What makes events of one source one chip: a monitor's task id. */
  key?: string
  at?: number
  /** A monitor's source ended by itself. */
  ended?: boolean
  /** For a monitor: each time it fired and what it printed, oldest first. */
  lines?: { at: number; text: string }[]
}

export interface Sent {
  id: string
  text: string
  at?: number
  /** The agent was busy when it was sent, so it waits its turn. */
  queued: boolean
}

const LONG_TURN_MS = 8000
/** A thinking time longer than this is a gap in the saved conversation (a session picked up later), not thinking. */
const MAX_THINK_MS = 15 * 60_000

/** A span of whole seconds, as a reply says how long it worked: 4s, 1m 12s. */
export const spanLabel = (sec: number) => (sec >= 60 ? `${Math.floor(sec / 60)}m ${sec % 60}s` : `${sec}s`)

/** Items in order, with tool results folded into their calls, shell output joined to its command, and turn times added. */
export function toRows(items: ChatItem[], sent: Sent[]): Row[] {
  const results = new Map<string, { text: string; isError: boolean; images: string[]; at: number }>()
  for (const i of items) if (i.kind === 'tool-result') results.set(i.toolUseId, { text: i.text, isError: i.isError, images: i.images ?? [], at: i.at })
  const rows: Row[] = []
  let turnStart = 0
  let lastReply: Extract<Row, { kind: 'assistant' }> | null = null
  let lastAt = 0
  // When the step before this one was saved, results included: thinking is timed from there.
  let before: number | null = null
  let thinkMs = 0
  const endTurn = () => {
    // A reply before any message of yours (a session-start greeting) has no turn to time.
    if (lastReply && turnStart > 0 && lastAt - turnStart > LONG_TURN_MS) lastReply.took = Math.round((lastAt - turnStart) / 1000)
    lastReply = null
  }
  for (const i of items) {
    const stepBefore = before
    before = i.at
    if (i.kind === 'tool-result') continue
    if (i.kind === 'user') (endTurn(), (turnStart = i.at))
    lastAt = i.at
    switch (i.kind) {
      case 'tool': {
        if (i.name === 'Agent' || i.name === 'Task') {
          const call = { toolUseId: i.toolUseId, description: String(i.input.description ?? i.input.subagent_type ?? 'subagent'), subagentType: String(i.input.subagent_type ?? 'agent') }
          const last = rows.at(-1)
          if (last?.kind === 'delegation') last.calls.push(call)
          else rows.push({ kind: 'delegation', id: i.id, calls: [call] })
          break
        }
        const r = results.get(i.toolUseId)
        const sec = r ? Math.round((r.at - i.at) / 1000) : 0
        rows.push({ kind: 'tool', id: i.id, run: { name: i.name, input: i.input, result: r && { text: r.text, isError: r.isError }, images: r?.images.some(Boolean) ? r.images : undefined, ...(sec >= 1 && { sec }), at: i.at, id: i.id } as ToolRun })
        break
      }
      case 'subagent-report':
        rows.push({ kind: 'report', id: i.id, agentId: i.agentId, body: i.body })
        break
      case 'thinking':
        // A run of thinking blocks reads as one, and its time is the blocks' together.
        {
          const gap = stepBefore === null ? 0 : i.at - stepBefore
          const last = rows.at(-1)
          const row: Extract<Row, { kind: 'thinking' }> = last?.kind === 'thinking' ? last : { kind: 'thinking', id: i.id }
          if (row !== last) (rows.push(row), (thinkMs = 0))
          thinkMs = gap > 0 && gap <= MAX_THINK_MS ? thinkMs + gap : thinkMs
          const sec = Math.round(thinkMs / 1000)
          if (sec >= 1) row.took = sec
        }
        break
      case 'user':
        rows.push({ kind: 'user', id: i.id, text: i.text, at: i.at })
        break
      case 'image':
        rows.push({ kind: 'image', id: i.id, src: i.src })
        break
      case 'handoff-out': {
        const handoff = parseHandoff(i.text)
        if (handoff) rows.push({ kind: 'handoff-out', id: i.id, to: i.to, status: i.status, handoff, text: i.text })
        break
      }
      case 'shell':
        rows.push({ kind: 'shell', id: i.id, command: i.command })
        break
      case 'shell-out': {
        const prev = rows.at(-1)
        if (prev?.kind === 'shell' && !prev.out) prev.out = { stdout: i.stdout, stderr: i.stderr }
        else rows.push({ kind: 'note', id: i.id, at: i.at, event: 'command', text: [i.stdout, i.stderr].filter(Boolean).join('\n') })
        break
      }
      case 'command': {
        const row: Row = { kind: 'command', id: i.id, name: i.name, args: i.args }
        // Claude saves the /compact line after the compaction it caused; it reads first.
        const prev = rows.at(-1)
        if (i.name === '/compact' && prev?.kind === 'note' && prev.text.startsWith('Conversation compacted')) rows.splice(-1, 0, row)
        else rows.push(row)
        break
      }
      case 'assistant': {
        const row: Extract<Row, { kind: 'assistant' }> = { kind: 'assistant', id: i.id, text: i.text }
        rows.push(row)
        lastReply = row
        break
      }
      default: {
        // /compact leaves a boundary and a summary; they read as one card, where the compaction happened.
        const isSummary = i.kind === 'note' && !!i.detail
        const isBoundary = i.kind === 'note' && !i.detail && i.text.startsWith('Conversation compacted')
        const prev = rows.at(-1)
        if (isSummary && prev?.kind === 'note' && !prev.detail && prev.text.startsWith('Conversation compacted')) {
          prev.detail = i.detail
          break
        }
        if (isBoundary) {
          const written = prev?.kind === 'note' && prev.text === 'Conversation summary' ? (rows.pop() as Extract<Row, { kind: 'note' }>) : undefined
          rows.push({ kind: 'note', id: i.id, at: i.at, text: i.text, ...(i.event && { event: i.event }), ...(written?.detail && { detail: written.detail }) })
          break
        }
        rows.push({ kind: 'note', id: i.id, at: i.at, text: i.text, ...(i.detail && { detail: i.detail }), ...(i.detailLabel && { detailLabel: i.detailLabel }), ...(i.hook && { hook: i.hook }), ...(i.event && { event: i.event }), ...(i.tone && { tone: i.tone }), ...(i.key && { key: i.key }), ...(i.ended && { ended: true }) })
      }
    }
  }
  endTurn()
  // A hook's note goes on the agent reply it caused, so the reply never seems to answer nothing. An agent usually looks into what a
  // hook said (thinking, a tool call or two) before it answers, so a note with findings reaches the next reply of the same turn,
  // stopping at your next message. One without findings (a clean scan) only goes on a reply right after it. Otherwise it stays a note.
  const hasFindings = (h: HookInfo) => h.findings.length > 0 || (h.issues ?? 0) > 0
  const yours = new Set<Row['kind']>(['user', 'command', 'shell', 'image'])
  const onReply = new Map<number, HookInfo[]>()
  const moved = new Set<number>()
  rows.forEach((r, i) => {
    if (r.kind !== 'note' || !r.hook) return
    let adjacent = true
    for (let j = i + 1; j < rows.length; j++) {
      const n = rows[j]!
      if (yours.has(n.kind)) return
      if (n.kind === 'assistant') {
        if (adjacent || hasFindings(r.hook)) (onReply.set(j, [...(onReply.get(j) ?? []), r.hook]), moved.add(i))
        return
      }
      if (n.kind !== 'thinking' && !(n.kind === 'note' && n.hook)) adjacent = false
    }
  })
  const joined = rows.flatMap((r, i): Row[] => (moved.has(i) ? [] : onReply.has(i) ? [{ ...(r as Extract<Row, { kind: 'assistant' }>), hooks: onReply.get(i)! }] : [r]))
  rows.splice(0, rows.length, ...gather(joined))
  // Messages sent from the composer show at once, until the transcript has them.
  // Claude may record it without the attached-file mentions, as a shell command, or as a slash command.
  const norm = (t: string) => t.replace(/@"[^"]*"/g, '').replace(/\s+/g, ' ').trim()
  const said = new Set<string>()
  for (const i of items) {
    if (i.kind === 'user') said.add(norm(i.text))
    else if (i.kind === 'shell') said.add(norm(`!${i.command}`))
    else if (i.kind === 'command') said.add(norm(`${i.name} ${i.args}`))
  }
  for (const p of sent) {
    const n = norm(p.text)
    // A message that was only pictures is done once a newer picture shows up.
    const done = n ? said.has(n) : items.some((i) => i.kind === 'image' && i.at >= (p.at ?? 0) - 2000)
    if (!done) rows.push({ kind: 'user', id: p.id, text: p.text, pending: true, queued: p.queued })
  }
  return rows
}

/**
 * System events (a Monitor firing, an interrupt, a failed task, a command's output, a compaction, a hook) become chips: a monitor
 * that fires again joins its first chip, wherever that is, and events that follow one another share one row of chips.
 */
function gather(rows: Row[]): Row[] {
  const monitors = new Map<string, NoteRow>()
  // A monitor's call is where what it printed goes; a schedule's is where its cancelling is marked.
  const watching = new Map<string, Extract<Row, { kind: 'tool' }>>()
  const schedules: { row: Extract<Row, { kind: 'tool' }>; id: string }[] = []
  const out: Row[] = []
  for (const r of rows) {
    if (r.kind === 'tool') {
      if (r.run.name === 'Monitor') {
        const id = monitorTask(r.run.result?.text ?? '').id
        if (id) watching.set(id, r)
      } else if (r.run.name === 'Schedule') schedules.push({ row: r, id: jobId(r.run.result?.text ?? '') })
      else if (r.run.name === 'Unschedule') {
        const id = typeof r.run.input.id === 'string' ? r.run.input.id : ''
        // One named, or (a loop stopped) every wake-up still waiting.
        for (const s of schedules) if (id ? s.id === id : s.row.run.input.inSeconds !== undefined) s.row.run.cancelled = true
      }
      out.push(r)
      continue
    }
    if (r.kind === 'note' && r.event === 'monitor' && r.key && watching.has(r.key)) {
      const call = watching.get(r.key)!
      if (r.ended) call.run.ended = r.at ?? 0
      else (call.run.firings ??= []).push({ at: r.at ?? 0, text: r.detail ?? '' })
      continue
    }
    // The end of a source nobody here started is not worth a chip.
    if (r.kind === 'note' && r.ended) continue
    if (r.kind !== 'note' || !r.event) {
      out.push(r)
      continue
    }
    const key = r.event === 'monitor' ? r.key : undefined
    if (key) {
      const line = { at: r.at ?? 0, text: r.detail ?? '' }
      const first = monitors.get(key)
      if (first) {
        first.lines!.push(line)
        continue
      }
      r.lines = [line]
      monitors.set(key, r)
    }
    const last = out.at(-1)
    if (last?.kind === 'events') last.chips.push(r)
    else out.push({ kind: 'events', id: r.id, chips: [r] })
  }
  return out
}

const s = (v: unknown) => (typeof v === 'string' ? v : '')

/** Everything readable on a row, for searching. */
export function rowText(r: Row): string {
  switch (r.kind) {
    case 'user':
    case 'assistant':
    case 'note':
      return r.text
    case 'command':
      return `${r.name} ${r.args}`
    case 'shell':
      return `${r.command} ${r.out?.stdout ?? ''} ${r.out?.stderr ?? ''}`
    case 'report':
      return r.body
    case 'handoff-out':
      return `Hand-off to ${r.to} ${r.text}`
    case 'events':
      return r.chips.map((c) => [c.text, c.detail, ...(c.lines?.map((l) => l.text) ?? [])].filter(Boolean).join(' ')).join(' ')
    case 'delegation':
      return `Delegated ${r.calls.map((c) => `${c.subagentType} ${c.description}`).join(' ')}`
    case 'tool': {
      const i = r.run.input
      return [r.run.name, s(i.command), s(i.description), s(i.file_path), s(i.pattern), s(i.url), s(i.query), s(i.old_string), s(i.new_string), r.run.result?.text].join(' ')
    }
    default:
      return ''
  }
}

/** The conversation as Markdown, for copying out. */
export function toMarkdown(rows: Row[], agentName: string): string {
  const out: string[] = []
  for (const r of rows) {
    switch (r.kind) {
      case 'user':
        out.push(`**You:** ${r.text}`)
        break
      case 'assistant':
        out.push(`**${agentName}:** ${r.text}`)
        break
      case 'shell':
        out.push(`\`\`\`sh\n$ ${r.command}\n${r.out?.stdout ?? ''}${r.out?.stderr ? `\n${r.out.stderr}` : ''}\n\`\`\``)
        break
      case 'command':
        out.push(`\`${r.name} ${r.args}\``.trim())
        break
      case 'report':
        out.push(`**Subagent report:** ${r.body}`)
        break
      case 'delegation':
        out.push(`Delegated to ${r.calls.length} subagent${r.calls.length === 1 ? '' : 's'}:\n${r.calls.map((c) => `- ${c.description}`).join('\n')}`)
        break
      case 'tool': {
        const i = r.run.input
        if (r.run.name === 'Bash') out.push(`Ran \`${s(i.command)}\``)
        else if (r.run.name === 'Edit' || r.run.name === 'Write' || r.run.name === 'MultiEdit') out.push(`Edited \`${s(i.file_path)}\``)
        else if (r.run.name === 'Read') out.push(`Read \`${s(i.file_path)}\``)
        else out.push(`Used ${r.run.name}`)
        break
      }
      case 'note':
        out.push(`_${r.text}_`)
        break
      case 'events':
        for (const c of r.chips) out.push(`_${c.text}${c.lines && c.lines.length > 1 ? ` (${c.lines.length}×)` : ''}_`)
        break
    }
  }
  return out.join('\n\n')
}
export { modeLabel } from '../../shared/modes'

export type SubagentState = 'waiting' | 'working' | 'done' | 'stopped'
const QUIET_MS = 10 * 60_000

/** Waiting until Claude has made a file for it; done once it has answered; stopped when it never did and has gone quiet. */
export function subagentState(info: SubagentInfo | undefined, now: number): SubagentState {
  if (!info) return 'waiting'
  if (info.done) return 'done'
  if (info.stopped) return 'stopped'
  return now - info.updatedAt > QUIET_MS ? 'stopped' : 'working'
}

export function elapsedLabel(ms: number): string {
  const s = Math.max(0, ms) / 1000
  return s < 60 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)}m ${String(Math.floor(s % 60)).padStart(2, '0')}s`
}

/** Splits a message into plain text and @file mentions (`@"a path.png"` or `@src/app.ts`); an @ inside a word is not a mention. */
export function splitMentions(text: string): { file: boolean; text: string }[] {
  const out: { file: boolean; text: string }[] = []
  let last = 0
  for (const m of text.matchAll(/(?<=^|\s)@(?:"([^"]+)"|([^\s"@]*[/.][^\s"@]*))/g)) {
    if (m.index! > last) out.push({ file: false, text: text.slice(last, m.index) })
    out.push({ file: true, text: m[1] ?? m[2]! })
    last = m.index! + m[0].length
  }
  if (last < text.length) out.push({ file: false, text: text.slice(last) })
  return out.length ? out : [{ file: false, text }]
}

/** What the message box is showing, split so a command or @file can be drawn differently; the pieces always join back to `text`. */
export function highlight(text: string): { kind: 'plain' | 'command' | 'plugin' | 'file'; text: string }[] {
  const out: { kind: 'plain' | 'command' | 'plugin' | 'file'; text: string }[] = []
  let last = 0
  // A command is a lone word after a slash that starts a word (anywhere in the message); a longer path that begins with a slash is a file.
  // Files: @mentions, and paths written out (/abs/path, ~/path, ./path, ../path).
  for (const m of text.matchAll(/((?<=^|\s)\/[\w.-]+(?::[\w.-]+)*(?=\s|$))|(?<=^|\s)(@(?:"[^"]+"|[^\s"@]*[/.][^\s"@]*)|(?:~|\.{1,2})?\/[^\s"'<>|]*\/[^\s"'<>|]+)/g)) {
    if (m.index! > last) out.push({ kind: 'plain', text: text.slice(last, m.index) })
    out.push({ kind: m[2] ? 'file' : m[1]!.includes(':') ? 'plugin' : 'command', text: m[0] })
    last = m.index! + m[0].length
  }
  if (last < text.length) out.push({ kind: 'plain', text: text.slice(last) })
  return out
}

export type MdKind = 'plain' | 'mark' | 'bold' | 'italic' | 'code' | 'list' | 'quote'

/**
 * Text split so markdown can be styled where it is typed. The pieces always join back to `text`, and the styling
 * never changes a glyph's width, so the styled copy drawn behind the box stays aligned with the caret.
 */
export function markdownSpans(text: string): { kind: MdKind; text: string }[] {
  const out: { kind: MdKind; text: string }[] = []
  const push = (kind: MdKind, t: string) => {
    if (!t) return
    const prev = out[out.length - 1]
    if (prev && prev.kind === kind && kind === 'plain') prev.text += t
    else out.push({ kind, text: t })
  }
  for (const line of text.split(/(?<=\n)/)) {
    const head = /^(\s*)((?:[-*+]|\d+\.)\s+)/.exec(line) ?? /^()(>\s?)/.exec(line)
    let rest = line
    if (head) {
      push('plain', head[1]!)
      push(head[2]!.trim().startsWith('>') ? 'quote' : 'list', head[2]!)
      rest = line.slice(head[0].length)
    }
    let last = 0
    for (const m of rest.matchAll(/(`)([^`\n]+)`|(\*\*)(\S[^*\n]*)\*\*|(?<![*\w])(\*)([^\s*](?:[^*\n]*[^\s*])?)\*(?!\*)/g)) {
      push('plain', rest.slice(last, m.index))
      const [mark, kind, body] = m[1] ? ['`', 'code', m[2]!] : m[3] ? ['**', 'bold', m[4]!] : ['*', 'italic', m[6]!]
      push('mark', mark!)
      push(kind as MdKind, body)
      push('mark', mark!)
      last = m.index! + m[0].length
    }
    push('plain', rest.slice(last))
  }
  return out
}

export const isImagePath = (p: string) => /\.(png|jpe?g|gif|webp)$/i.test(p)

/** The message uses a little markdown: a "> " quote, **bold**, *italic*, `code` or a list. */
export function hasMarkdown(text: string): boolean {
  return /^\s*>\s?\S|\*\*\S[^*\n]*\*\*|(^|[^*\w])\*[^\s*][^*\n]*[^\s*]\*(?!\*)|`[^`\n]+`|^\s*([-*+]|\d+\.)\s+\S/m.test(text)
}
