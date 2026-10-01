import type { ChatItem } from '../../shared/chat'
import type { ToolRun } from './ToolCard'

export type Row =
  | { kind: 'user'; id: string; text: string; pending?: boolean; queued?: boolean }
  | { kind: 'image'; id: string; src: string }
  | { kind: 'shell'; id: string; command: string; out?: { stdout: string; stderr: string } }
  | { kind: 'command'; id: string; name: string; args: string }
  | { kind: 'assistant'; id: string; text: string; /** Seconds the turn took, when it took a while. */ took?: number }
  | { kind: 'thinking'; id: string }
  | { kind: 'tool'; id: string; run: ToolRun }
  | { kind: 'note'; id: string; text: string; detail?: string }

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
        const r = results.get(i.toolUseId)
        rows.push({ kind: 'tool', id: i.id, run: { name: i.name, input: i.input, result: r && { text: r.text, isError: r.isError }, images: r?.images.some(Boolean) ? r.images : undefined } as ToolRun })
        break
      }
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
      case 'command':
        rows.push({ kind: 'command', id: i.id, name: i.name, args: i.args })
        break
      case 'assistant': {
        const row: Extract<Row, { kind: 'assistant' }> = { kind: 'assistant', id: i.id, text: i.text }
        rows.push(row)
        lastReply = row
        break
      }
      default: {
        // /compact leaves a command, a boundary and a summary; they read as one card, where the compaction happened.
        const isSummary = i.kind === 'note' && !!i.detail
        const isBoundary = i.kind === 'note' && !i.detail && i.text.startsWith('Conversation compacted')
        const prev = rows.at(-1)
        if (isSummary && prev?.kind === 'note' && !prev.detail && prev.text.startsWith('Conversation compacted')) {
          prev.detail = i.detail
          break
        }
        if (isBoundary) {
          const written = prev?.kind === 'note' && prev.text === 'Conversation summary' ? (rows.pop() as Extract<Row, { kind: 'note' }>) : undefined
          const chip = rows.at(-1)
          if (chip?.kind === 'command' && chip.name === '/compact') rows.pop()
          rows.push({ kind: 'note', id: i.id, text: i.text, ...(written?.detail && { detail: written.detail }) })
          break
        }
        rows.push({ kind: 'note', id: i.id, text: i.text, ...(i.detail && { detail: i.detail }) })
      }
    }
  }
  endTurn()
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
  for (const m of text.matchAll(/(^\/[\w.-]+(?::[\w.-]+)*)|(?<=^|\s)(@(?:"[^"]+"|[^\s"@]*[/.][^\s"@]*))/g)) {
    if (m.index! > last) out.push({ kind: 'plain', text: text.slice(last, m.index) })
    out.push({ kind: m[2] ? 'file' : m[1]!.includes(':') ? 'plugin' : 'command', text: m[0] })
    last = m.index! + m[0].length
  }
  if (last < text.length) out.push({ kind: 'plain', text: text.slice(last) })
  return out
}

export const isImagePath = (p: string) => /\.(png|jpe?g|gif|webp)$/i.test(p)
