import type { ChatItem } from '../shared/chat'

const EDITS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t)
const oneLine = (t: string) => t.replace(/\s+/g, ' ').trim()

export interface NotesMeta {
  name: string
  branch: string | null
  cost?: number
}

/**
 * A short record of a conversation, built from what happened in it (no model involved): what was asked, which files
 * were changed, which commands ran and how the last reply ended.
 */
export function sessionNotes(items: ChatItem[], meta: NotesMeta): string {
  const asked = items.filter((i): i is Extract<ChatItem, { kind: 'user' }> => i.kind === 'user').map((i) => oneLine(i.text))
  const failed = new Set(items.flatMap((i) => (i.kind === 'tool-result' && i.isError ? [i.toolUseId] : [])))
  const files = new Set<string>()
  const ran: string[] = []
  for (const i of items) {
    if (i.kind === 'tool' && EDITS.has(i.name)) {
      const f = i.input.file_path ?? i.input.notebook_path
      if (typeof f === 'string') files.add(f)
    } else if (i.kind === 'tool' && i.name === 'Bash' && typeof i.input.command === 'string') {
      ran.push(`\`${clip(oneLine(i.input.command), 120)}\`${failed.has(i.toolUseId) ? ' (failed)' : ''}`)
    } else if (i.kind === 'shell') ran.push(`\`${clip(oneLine(i.command), 120)}\``)
  }
  const last = [...items].reverse().find((i): i is Extract<ChatItem, { kind: 'assistant' }> => i.kind === 'assistant')
  const start = items[0]?.at
  const when = start ? new Date(start).toISOString().slice(0, 16).replace('T', ' ') : ''
  const section = (title: string, lines: string[], numbered = false) =>
    lines.length ? `\n## ${title}\n\n${lines.map((l, n) => (numbered ? `${n + 1}. ${l}` : `- ${l}`)).join('\n')}\n` : ''
  return [
    `# Session notes: ${meta.name}`,
    '',
    [when && `Started ${when}`, meta.branch && `Branch \`${meta.branch}\``, meta.cost ? `Cost $${meta.cost.toFixed(2)}` : ''].filter(Boolean).join(' · '),
    section('Asked', asked.slice(0, 30).map((t) => clip(t, 240)), true),
    section('Files changed', [...files].map((f) => `\`${f}\``)),
    section('Commands run', ran.slice(0, 40)),
    last ? `\n## How it ended\n\n${last.text.trim()}\n` : ''
  ]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()
    .concat('\n')
}
