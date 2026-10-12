import { closeSync, openSync, readSync, realpathSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'
import type { LibraryHookIO } from '../ports'
import { agyHome } from './transcript'

/** How much of the end of a conversation file is looked at: the last message is near it. */
const TAIL = 256 * 1024
// Per conversation: the message (by its step number) the library was last asked about, so the model calls after a tool do not ask again.
const asked = new Map<string, number>()
// Per conversation file: the last step whose tool result was looked at, so each result is looked at once.
const scanned = new Map<string, number>()
// What agy's tool steps are called here, in the words the playbook's situations know.
const TOOLS: Record<string, string> = { RUN_COMMAND: 'run_command', VIEW_FILE: 'view_file' }

interface Step { step: number; type: string; content: string }

/** The tool results in the end of a conversation file, in order (the model's own words are not among them). */
function steps(file: string): Step[] {
  const out: Step[] = []
  for (const l of tail(file).split('\n')) {
    try {
      const s = JSON.parse(l) as { step_index?: string; source?: string; type?: string; content?: string }
      if (s.source === 'MODEL' && s.type && TOOLS[s.type] && typeof s.content === 'string') out.push({ step: Number(s.step_index), type: s.type, content: s.content })
    } catch {
      /* the first line of the tail may be cut in half */
    }
  }
  return out
}

function tail(file: string): string {
  const fd = openSync(file, 'r')
  try {
    const size = statSync(file).size
    const n = Math.min(size, TAIL)
    const buf = Buffer.alloc(n)
    readSync(fd, buf, 0, n, size - n)
    return buf.toString('utf8')
  } finally {
    closeSync(fd)
  }
}

/** The last thing the user said in this conversation, with its step number; agy's hook is not given it, only where the conversation is saved. */
function lastMessage(path: unknown): { step: number; text: string } | null {
  if (typeof path !== 'string') return null
  try {
    // Only agy's own saved conversations are read, however the path was written.
    const real = realpathSync(path)
    if (!real.startsWith(realpathSync(join(agyHome(), 'brain')) + sep) || !real.endsWith(`${sep}transcript_full.jsonl`)) return null
    const lines = tail(real).split('\n')
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const s = JSON.parse(lines[i]!) as { type?: string; step_index?: string; content?: string }
        if (s.type !== 'USER_INPUT' || typeof s.content !== 'string') continue
        return { step: Number(s.step_index), text: s.content.replace(/^<USER_REQUEST>\s*/, '').replace(/\s*<\/USER_REQUEST>[\s\S]*$/, '') }
      } catch {
        /* the first line of the tail may be cut in half */
      }
    }
  } catch {
    /* no such file, or not one of agy's */
  }
  return null
}

/**
 * What the app answers agy's hooks: before the first model call of a message, a library line to add (agy keeps it in the conversation, so it is
 * sent only when there is something to say); after a tool call, which skill file was read. Nothing else is touched: agy's permission
 * hooks are not used, since an answer from one would decide what agy may do.
 */
export function agyLibraryHook(event: string, payload: Record<string, unknown>, io: LibraryHookIO): Record<string, unknown> {
  if (event === 'pre-inv') {
    const conv = String(payload.conversationId ?? '')
    const m = lastMessage(payload.transcriptPath)
    if (!conv || !m) return {}
    const lines: string[] = []
    // A tool result since the last model call may show a situation (a merge conflict) the playbook has something for. A conversation first seen is not read back: only what happens from now on.
    if (io.met) {
      const file = realpathSync(payload.transcriptPath as string)
      const seen = scanned.get(file)
      const all = steps(file)
      scanned.set(file, Math.max(seen ?? -1, ...all.map((x) => x.step), m.step))
      if (seen !== undefined) for (const x of all.filter((y) => y.step > seen)) {
        const line = io.met(TOOLS[x.type]!, {}, x.content)
        if (line) lines.push(line)
      }
    }
    if (asked.get(conv) !== m.step) {
      asked.set(conv, m.step)
      const line = io.remind(m.text)
      if (line) lines.unshift(line)
    }
    return lines.length ? { injectSteps: lines.map((ephemeralMessage) => ({ ephemeralMessage })) } : {}
  }
  if (event === 'post-tool') {
    const call = payload.toolCall as { name?: string; args?: { AbsolutePath?: unknown } } | undefined
    if (call?.name === 'view_file' && typeof call.args?.AbsolutePath === 'string') io.used(call.args.AbsolutePath)
  }
  return {}
}
