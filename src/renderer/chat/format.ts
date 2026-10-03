import type { ChatItem, HookInfo, SubagentInfo } from '../../shared/chat'
import type { ToolRun } from './ToolCard'

export type Row =
  | { kind: 'user'; id: string; text: string; pending?: boolean; queued?: boolean }
  | { kind: 'image'; id: string; src: string }
  | { kind: 'shell'; id: string; command: string; out?: { stdout: string; stderr: string } }
  | { kind: 'command'; id: string; name: string; args: string }
  | { kind: 'assistant'; id: string; text: string; /** Seconds the turn took, when it took a while. */ took?: number; /** What hooks told the agent just before this reply, which is why it was written. */ hooks?: HookInfo[] }
  | { kind: 'thinking'; id: string }
  | { kind: 'tool'; id: string; run: ToolRun }
  /** The subagents one reply started, together; their progress comes from Claude's own files for them. */
  | { kind: 'delegation'; id: string; calls: { toolUseId: string; description: string; subagentType: string }[] }
  /** The report a subagent handed back when it finished. */
  | { kind: 'report'; id: string; agentId: string; body: string }
  | { kind: 'note'; id: string; text: string; detail?: string; detailLabel?: string; hook?: HookInfo }

export interface Sent {
  id: string
  text: string
  at?: number
  /** The agent was busy when it was sent, so it waits its turn. */
  queued: boolean
}

const LONG_TURN_MS = 8000

/** Items in order, with tool results folded into their calls, shell output joined to its command, and turn times added. */
export function toRows(items: ChatItem[], sent: Sent[]): Row[] {
  const results = new Map<string, { text: string; isError: boolean; images: string[] }>()
  for (const i of items) if (i.kind === 'tool-result') results.set(i.toolUseId, { text: i.text, isError: i.isError, images: i.images ?? [] })
  const rows: Row[] = []
  let turnStart = 0
  let lastReply: Extract<Row, { kind: 'assistant' }> | null = null
  let lastAt = 0
  const endTurn = () => {
    // A reply before any message of yours (a session-start greeting) has no turn to time.
    if (lastReply && turnStart > 0 && lastAt - turnStart > LONG_TURN_MS) lastReply.took = Math.round((lastAt - turnStart) / 1000)
    lastReply = null
  }
  for (const i of items) {
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
        rows.push({ kind: 'tool', id: i.id, run: { name: i.name, input: i.input, result: r && { text: r.text, isError: r.isError }, images: r?.images.some(Boolean) ? r.images : undefined } as ToolRun })
        break
      }
      case 'subagent-report':
        rows.push({ kind: 'report', id: i.id, agentId: i.agentId, body: i.body })
        break
      case 'thinking':
        // A run of thinking blocks reads as one.
        if (rows.at(-1)?.kind !== 'thinking') rows.push({ kind: 'thinking', id: i.id })
        break
      case 'user':
        rows.push({ kind: 'user', id: i.id, text: i.text })
        break
      case 'image':
        rows.push({ kind: 'image', id: i.id, src: i.src })
        break
      case 'shell':
        rows.push({ kind: 'shell', id: i.id, command: i.command })
        break
      case 'shell-out': {
        const prev = rows.at(-1)
        if (prev?.kind === 'shell' && !prev.out) prev.out = { stdout: i.stdout, stderr: i.stderr }
        else rows.push({ kind: 'note', id: i.id, text: [i.stdout, i.stderr].filter(Boolean).join('\n') })
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
          rows.push({ kind: 'note', id: i.id, text: i.text, ...(written?.detail && { detail: written.detail }) })
          break
        }
        rows.push({ kind: 'note', id: i.id, text: i.text, ...(i.detail && { detail: i.detail }), ...(i.detailLabel && { detailLabel: i.detailLabel }), ...(i.hook && { hook: i.hook }) })
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
  rows.splice(0, rows.length, ...joined)
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
