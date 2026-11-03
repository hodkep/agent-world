import type { ChatItem } from '../../shared/chat'
import { scrub } from './digest'

export interface ChatTurn { who: 'person' | 'agent'; text: string }

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s)
const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim()

/** The file, command or pattern a tool call was about, in a few words. */
function detail(input: Record<string, unknown>): string {
  for (const k of ['file_path', 'path', 'command', 'pattern', 'url', 'description']) if (typeof input[k] === 'string' && input[k]) return cut(oneLine(input[k] as string), 120)
  return ''
}

/**
 * What an agent has written lately, for the voice to report from: the person's messages to it, its replies and a line for each tool it ran.
 * Its thinking and the raw output of its tools are left out. Each turn is shortened and the whole is kept to a size, the oldest going first;
 * keys and tokens are blotted out. It is the agent's words, so the voice is told to treat it as data.
 */
export function recentChat(items: ChatItem[], o: { count?: number } = {}): ChatTurn[] {
  const turns: ChatTurn[] = []
  for (const it of items) {
    if (it.kind === 'user') turns.push({ who: 'person', text: it.text })
    else if (it.kind === 'assistant') turns.push({ who: 'agent', text: it.text })
    else if (it.kind === 'tool') turns.push({ who: 'agent', text: `ran ${it.name}${detail(it.input) ? ` ${detail(it.input)}` : ''}` })
    else if (it.kind === 'subagent-report') turns.push({ who: 'agent', text: `a helper reported: ${it.body}` })
  }
  const out: ChatTurn[] = []
  let size = 0
  for (const t of turns.slice(-(o.count ?? 8)).reverse()) {
    const text = cut(scrub(t.text.trim()), 600)
    if (size + text.length > 4000) break
    size += text.length
    out.unshift({ who: t.who, text })
  }
  return out
}

/** The last thing the agent said, shortened; null when it has said nothing. */
export function lastReply(items: ChatItem[]): string | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]!
    if (it.kind === 'assistant' && it.text.trim()) return cut(scrub(oneLine(it.text)), 400)
  }
  return null
}
