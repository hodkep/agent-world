import { join } from 'node:path'
import type { ChatItem } from '../shared/chat'
import { projectSlug } from './history'

export const transcriptPath = (projectsDir: string, cwd: string, sessionId: string) => join(projectsDir, projectSlug(cwd), `${sessionId}.jsonl`)

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {})
const str = (v: unknown) => (typeof v === 'string' ? v : '')

const tag = (s: string, name: string) => new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(s)?.[1]?.trim()

/** Text of a tool result: a string, or text blocks (images are marked, not shown). */
function resultText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.map((b) => (obj(b).type === 'text' ? str(obj(b).text) : obj(b).type === 'image' ? '[image]' : '')).filter(Boolean).join('\n')
}

/** One saved transcript line as chat items (none for the many kinds of bookkeeping lines Claude also writes). */
export function parseTranscriptLine(raw: string): ChatItem[] {
  let o: Obj
  try {
    o = JSON.parse(raw) as Obj
  } catch {
    return []
  }
  if (o.isSidechain === true || o.isMeta === true) return []
  const at = Date.parse(str(o.timestamp)) || 0
  const uuid = str(o.uuid) || `${at}`
  const type = str(o.type)
  const message = obj(o.message)

  if (type === 'system') return o.subtype === 'compact_boundary' ? [{ kind: 'note', id: uuid, at, text: str(o.content) || 'Conversation compacted' }] : []

  if (type === 'user') {
    const content = message.content
    if (typeof content === 'string') return userText(uuid, at, content)
    if (!Array.isArray(content)) return []
    return content.flatMap((b, i): ChatItem[] => {
      const block = obj(b)
      if (block.type === 'tool_result') return [{ kind: 'tool-result', id: `${uuid}:${i}`, at, toolUseId: str(block.tool_use_id), text: resultText(block.content), isError: block.is_error === true }]
      if (block.type === 'text') return userText(`${uuid}:${i}`, at, str(block.text))
      if (block.type === 'image') return [{ kind: 'user', id: `${uuid}:${i}`, at, text: '[image]' }]
      return []
    })
  }

  if (type === 'assistant') {
    const content = message.content
    if (!Array.isArray(content)) return []
    return content.flatMap((b, i): ChatItem[] => {
      const block = obj(b)
      const id = `${uuid}:${i}`
      if (block.type === 'text' && str(block.text).trim()) return [{ kind: 'assistant', id, at, text: str(block.text) }]
      if (block.type === 'thinking') return [{ kind: 'thinking', id, at }]
      if (block.type === 'tool_use') return [{ kind: 'tool', id, at, toolUseId: str(block.id), name: str(block.name), input: obj(block.input) }]
      return []
    })
  }
  return []
}

function userText(id: string, at: number, text: string): ChatItem[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  if (trimmed === '[Request interrupted by user]' || trimmed.startsWith('[Request interrupted by user')) return [{ kind: 'note', id, at, text: 'Interrupted' }]
  const name = tag(trimmed, 'command-name')
  if (name) return [{ kind: 'command', id, at, name, args: tag(trimmed, 'command-args') ?? '' }]
  const out = tag(trimmed, 'local-command-stdout')
  if (out !== undefined) return out ? [{ kind: 'note', id, at, text: out }] : []
  // Caveats and reminders Claude inserts around the conversation are not the user's words.
  if (/^<(local-command-caveat|system-reminder|command-message)/.test(trimmed)) return []
  return [{ kind: 'user', id, at, text: trimmed }]
}
