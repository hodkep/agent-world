import { closeSync, openSync, readSync, realpathSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'
import type { LibraryHookIO } from '../ports'
import { agyHome } from './transcript'

/** How much of the end of a conversation file is looked at: the last message is near it. */
const TAIL = 256 * 1024
// Per conversation: the message (by its step number) the library was last asked about, so the model calls after a tool do not ask again.
const asked = new Map<string, number>()

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
        return { step: Number(s.step_index), text: s.content.replace(/^<USER_REQUEST>\s*/, '').replace(/\s*<\/USER_REQUEST>\s*$/, '') }
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
    if (!conv || !m || asked.get(conv) === m.step) return {}
    asked.set(conv, m.step)
    const line = io.remind(m.text)
    return line ? { injectSteps: [{ ephemeralMessage: line }] } : {}
  }
  if (event === 'post-tool') {
    const call = payload.toolCall as { name?: string; args?: { AbsolutePath?: unknown } } | undefined
    if (call?.name === 'view_file' && typeof call.args?.AbsolutePath === 'string') io.used(call.args.AbsolutePath)
  }
  return {}
}
