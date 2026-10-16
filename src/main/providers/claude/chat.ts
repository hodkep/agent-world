import { unwrapPasted } from '../../../shared/pasted'
import { claudeCalls } from './toolTable'
import { parseHandback, parseTaskNotification } from '../../../shared/subagentMessages'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { ChatItem } from '../../../shared/chat'
import { projectSlug } from './history'

export const transcriptPath = (projectsDir: string, cwd: string, sessionId: string) => join(projectsDir, projectSlug(cwd), `${sessionId}.jsonl`)

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {})
const str = (v: unknown) => (typeof v === 'string' ? v : '')

const tag = (s: string, name: string) => new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(s)?.[1]?.trim()

// A picture bigger than this stays in the transcript file rather than being sent to the window.
const MAX_IMAGE_CHARS = 6 * 1024 * 1024

function imageSrc(block: Obj): string {
  const src = obj(block.source)
  const data = str(src.data)
  return src.type === 'base64' && data && data.length <= MAX_IMAGE_CHARS ? `data:${str(src.media_type) || 'image/png'};base64,${data}` : ''
}

/** Text of a tool result: a string, or text blocks; pictures come out separately. */
function resultText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.map((b) => (obj(b).type === 'text' ? str(obj(b).text) : '')).filter(Boolean).join('\n')
}
const resultImages = (content: unknown): string[] => (Array.isArray(content) ? content.filter((b) => obj(b).type === 'image').map((b) => imageSrc(obj(b))) : [])

/** A hook's message to the agent as a one-line note (who, and what it is about) with the full text behind a button. */
/** What the playbook adds to a message: the rulebook line ("Reminder: tdd (when …); …") or the whole catalog of items. */
const RULEBOOK = /^Reminder: [\w.-]+ \([^)]*\)(; [\w.-]+ \([^)]*\))*\./
const isRulebook = (detail: string) => RULEBOOK.test(detail) || detail.startsWith('Library items and when each applies')

function hookNote(id: string, at: number, a: Obj): ChatItem[] {
  const event = str(a.hookName) || str(a.hookEvent)
  // What a session starts with is the user's own setup, not news.
  if (event.startsWith('SessionStart')) return []
  const detail = (Array.isArray(a.content) ? a.content.map(str) : [str(a.content)]).join('\n\n').trim()
  if (!detail) return []
  if (event.startsWith('UserPromptSubmit') && isRulebook(detail)) return [{ kind: 'note', id, at, text: 'Rulebook reminder', detail, detailLabel: 'details', hook: { event, title: 'Rulebook reminder', kind: 'rulebook', findings: [] }, event: 'hook' }]
  const from = /^\[([^\]]+)\]\s*/.exec(detail)
  const first = detail.slice(from?.[0].length ?? 0).split('\n')[0]!.trim().replace(/[:.]$/, '')
  const gist = first.length > 110 ? `${first.slice(0, 109)}…` : first
  const lines = detail.slice(from?.[0].length ?? 0).split('\n')
  const count = /\((\d+) issue\(s\)\)/.exec(lines[0]!)
  const findings = lines.flatMap((l) => {
    const m = /^-\s+(\S+)\s+\[([^\]]+)\]\s+(.+)$/.exec(l.trim())
    return m ? [{ ref: m[1]!, rule: m[2]!, text: m[3]! }] : []
  })
  const title = lines[0]!.replace(/\s*\(\d+ issue\(s\)\):?\s*$/, '').trim().replace(/[:.]$/, '')
  const hook = { ...(from && { source: from[1]! }), event, title, ...(count && { issues: Number(count[1]) }), findings }
  return [{ kind: 'note', id, at, text: `${from ? `${from[1]} · ` : ''}${event} hook: ${gist}`, detail, detailLabel: 'details', hook, event: 'hook', ...((count ? Number(count[1]) : 0) > 0 && { tone: 'bad' as const }) }]
}

/** One saved transcript line as chat items (none for the many kinds of bookkeeping lines Claude also writes). */
/** `subagent`: the lines are a subagent's own file, whose lines Claude marks as a side chain; they are the conversation there. */
export function parseTranscriptLine(raw: string, opts: { subagent?: boolean } = {}): ChatItem[] {
  let o: Obj
  try {
    o = JSON.parse(raw) as Obj
  } catch {
    return []
  }
  if (o.isSidechain === true && !opts.subagent) return []
  const at = Date.parse(str(o.timestamp)) || 0
  const uuid = str(o.uuid) || `${at}`
  const type = str(o.type)
  const message = obj(o.message)
  // The harness marks a subagent's hand-back as not typed by the user, but it is the answer the chat should show.
  if (o.isMeta === true) {
    const report = type === 'user' ? parseHandback(typeof message.content === 'string' ? message.content : resultText(message.content)) : null
    return report ? [{ kind: 'subagent-report', id: uuid, at, ...report }] : []
  }

  // What a hook told the agent (a linter's findings, a reminder) is shown, or the agent's next words answer something nobody can see.
  if (type === 'attachment' && obj(o.attachment).type === 'hook_additional_context') return hookNote(uuid, at, obj(o.attachment))

  // Typed while Claude was busy: it is saved as a queued command when Claude picks it up, not as a user line.
  const queued = obj(o.attachment)
  if (type === 'attachment' && queued.type === 'queued_command') return obj(queued.origin).kind === 'human' ? userText(uuid, at, str(queued.prompt)) : []

  if (type === 'system') return o.subtype === 'compact_boundary' ? [{ kind: 'note', id: uuid, at, text: compactNote(str(o.content) || 'Conversation compacted', obj(o.compactMetadata)), event: 'compact' }] : []

  // The summary Claude writes after /compact is model context, not something the user said.
  if (type === 'user' && o.isCompactSummary === true) {
    const c = message.content
    const body = (typeof c === 'string' ? c : resultText(c)).trim()
    return body ? [{ kind: 'note', id: uuid, at, text: 'Conversation summary', detail: body, event: 'compact' }] : []
  }

  if (type === 'user') {
    const content = message.content
    if (typeof content === 'string') return userText(uuid, at, content)
    if (!Array.isArray(content)) return []
    return content.flatMap((b, i): ChatItem[] => {
      const block = obj(b)
      if (block.type === 'tool_result') {
        const images = resultImages(block.content)
        return [{ kind: 'tool-result', id: `${uuid}:${i}`, at, toolUseId: str(block.tool_use_id), text: resultText(block.content), isError: block.is_error === true, ...(images.length && { images }) }]
      }
      if (block.type === 'text') return userText(`${uuid}:${i}`, at, str(block.text))
      if (block.type === 'image') return [{ kind: 'image', id: `${uuid}:${i}`, at, mediaType: str(obj(block.source).media_type) || 'image/png', src: imageSrc(block) }]
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
      if (block.type === 'tool_use') return claudeCalls.translate({ id: str(block.id), name: str(block.name), args: obj(block.input) }).map((c) => ({ kind: 'tool' as const, id, at, toolUseId: c.id, name: c.name, input: c.input }))
      return []
    })
  }
  return []
}

const kTokens = (n: unknown) => (typeof n === 'number' ? `${Math.round(n / 1000)}k` : '')

function compactNote(base: string, m: Obj): string {
  const pre = kTokens(m.preTokens)
  const post = kTokens(m.postTokens)
  const dur = typeof m.durationMs === 'number' ? `${Math.round(m.durationMs / 1000)}s` : ''
  const how = [str(m.trigger), dur].filter(Boolean).join(', ')
  if (!pre || !post) return base
  return `${base} · ${pre} → ${post} tokens${how ? ` (${how})` : ''}`
}

// Colour codes in command output; the escape byte is often already stripped from the saved line.
const ANSI = /\x1b?\[\d+(;\d+)*m/g

function userText(id: string, at: number, text: string): ChatItem[] {
  const trimmed = unwrapPasted(text).trim()
  if (!trimmed) return []
  if (trimmed === '[Request interrupted by user]' || trimmed.startsWith('[Request interrupted by user')) return [{ kind: 'note', id, at, text: 'Interrupted', event: 'interrupted' }]
  const name = tag(trimmed, 'command-name')
  if (name) return [{ kind: 'command', id, at, name, args: tag(trimmed, 'command-args') ?? '' }]
  const shell = tag(trimmed, 'bash-input')
  if (shell !== undefined) return shell ? [{ kind: 'shell', id, at, command: shell }] : []
  const so = tag(trimmed, 'bash-stdout')
  const se = tag(trimmed, 'bash-stderr')
  if (so !== undefined || se !== undefined) return [{ kind: 'shell-out', id, at, stdout: so ?? '', stderr: se ?? '' }]
  const out = tag(trimmed, 'local-command-stdout')
  if (out !== undefined) {
    const clean = out.replace(ANSI, '').split('\n').filter((l) => !/^(Pre|Post)Compact .*completed successfully/.test(l.trim())).join('\n').trim()
    // The compaction card already says so; "ctrl+o" does nothing here.
    if (!clean || /^Compacted\b/.test(clean)) return []
    // The first line is what it says; any more is for opening.
    const [first, ...more] = clean.split('\n')
    return [{ kind: 'note', id, at, text: first!, event: 'command', ...(more.length > 0 && { detail: more.join('\n').trim() }) }]
  }
  // A background task ending: the report and the card already say so, unless it did not complete.
  const notice = parseTaskNotification(trimmed)
  if (notice) {
    // A monitor's source ending says so under its task: the chat puts that on the monitor's card, and drops it for any other task.
    if (notice.status === 'completed' && notice.taskId) return [{ kind: 'note', id, at, text: '', event: 'monitor', key: notice.taskId, ended: true }]
    if (notice.status === 'completed' || !notice.summary) return []
    // A Monitor firing says which monitor in its summary and what it printed in its body.
    const monitor = /^Monitor event:\s*"?(.*?)"?\s*$/.exec(notice.summary)
    if (monitor) return [{ kind: 'note', id, at, text: monitor[1]!, event: 'monitor', key: notice.taskId || monitor[1]!, ...(notice.event && { detail: notice.event }) }]
    return [{ kind: 'note', id, at, text: notice.summary, event: 'failed', tone: 'bad' }]
  }
  // Caveats and reminders Claude inserts around the conversation are not the user's words.
  if (/^<(local-command-caveat|system-reminder|command-message)/.test(trimmed)) return []
  return [{ kind: 'user', id, at, text: trimmed }]
}

/** The session whose transcript was written most recently since `sinceMs`, other than `exceptId`: where a rewind forked to. */
export function newestSession(dir: string, exceptId: string, sinceMs: number): string | null {
  try {
    const found = readdirSync(dir)
      .filter((f) => f.endsWith('.jsonl') && f !== `${exceptId}.jsonl`)
      .map((f) => ({ id: f.slice(0, -'.jsonl'.length), at: statSync(join(dir, f)).mtimeMs }))
      .filter((f) => f.at >= sinceMs)
      .sort((a, b) => b.at - a.at)
    return found[0]?.id ?? null
  } catch {
    return null
  }
}

/** Where a transcript line sits in the conversation tree: Claude links each line to the one before it, so a rewind makes a new branch. */
export interface LineNode {
  uuid: string
  parent: string | null
  message: boolean
  /** The reply it belongs to: every call of one reply shares it, so calls made side by side can be told from an abandoned try. */
  reply: string
  /** The tool calls it makes, or the calls whose results it carries. */
  uses: string[]
  results: string[]
}

export function lineNode(raw: string, opts: { subagent?: boolean } = {}): LineNode | null {
  try {
    const o = JSON.parse(raw) as Obj
    const uuid = str(o.uuid)
    if (!uuid) return null
    const blocks = Array.isArray(obj(o.message).content) ? (obj(o.message).content as unknown[]).map(obj) : []
    return {
      uuid,
      parent: str(o.parentUuid) || str(o.logicalParentUuid) || null,
      message: (o.type === 'user' || o.type === 'assistant') && (opts.subagent === true || o.isSidechain !== true),
      reply: o.type === 'assistant' ? str(o.requestId) || str(obj(o.message).id) : '',
      uses: blocks.filter((b) => b.type === 'tool_use').map((b) => str(b.id)),
      results: blocks.filter((b) => b.type === 'tool_result').map((b) => str(b.tool_use_id))
    }
  } catch {
    return null
  }
}
