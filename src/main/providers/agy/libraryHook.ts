import { closeSync, openSync, readSync, realpathSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'
import type { LibraryHookIO } from '../ports'
import { EDIT_TOOLS } from './plugin'
import { agyHome } from './transcript'

/** How much of the end of a conversation file is looked at: the last message is near it. */
const TAIL = 256 * 1024
// Per conversation: the message (by its step number) the library was last asked about, so the model calls after a tool do not ask again.
const asked = new Map<string, number>()
// The conversations already told how to reach the office's tools.
const toldTools = new Set<string>()

/**
 * The office's tools are not plain tools for agy: they are the tools of one MCP server, called through call_mcp_tool, with their schemas in files. Without this it
 * searched the app's own folders, ports and processes for them (dozens of calls) and took "todo#5" for a file.
 */
const toolsNote = () =>
  `The office's tools (task_begin, task_done, todo_update, todo_done, todo_get, todo_list, todo_search, plan_submit, step_done, recall, remember, and the others it names) are tools of the MCP server named agent-world: call them with call_mcp_tool, ServerName "agent-world", ToolName the tool's name, Arguments an object. A tool's arguments are described in ${join(agyHome(), 'mcp', 'agent-world', '<ToolName>.json')}; read that file once if you are unsure. A todo number such as todo#5 is the office's own: read it with todo_get, and never look for it in files, folders or processes outside your workspace.`

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
 * sent only when there is something to say); after a tool call, which skill file was read; before an edit, a denial while the plan hold is on.
 * It answers nothing else, so agy's own permissions decide everything the office does not hold back.
 */
export function agyLibraryHook(event: string, payload: Record<string, unknown>, io: LibraryHookIO): Record<string, unknown> {
  if (event === 'pre-inv') {
    const conv = String(payload.conversationId ?? '')
    const m = lastMessage(io.transcriptPath ?? payload.transcriptPath)
    if (!conv || !m) return {}
    const lines: string[] = []
    if (io.officeTools && !toldTools.has(conv)) {
      toldTools.add(conv)
      lines.push(toolsNote())
    }
    if (asked.get(conv) !== m.step) {
      asked.set(conv, m.step)
      const line = io.remind(m.text)
      if (line) lines.push(line)
    }
    return lines.length ? { injectSteps: lines.map((ephemeralMessage) => ({ ephemeralMessage })) } : {}
  }
  // Before an edit: deny it while the office holds it back. No answer otherwise, so agy's own permissions decide as they always did.
  if (event === 'pre-tool') {
    const call = payload.toolCall as { name?: string; args?: { TargetFile?: unknown } } | undefined
    const file = call?.args?.TargetFile
    if (call?.name && EDIT_TOOLS.includes(call.name) && typeof file === 'string' && file) {
      const why = io.editBlock?.(file)
      if (why) return { decision: 'deny', reason: why }
    }
    return {}
  }
  if (event === 'post-tool') {
    const call = payload.toolCall as { name?: string; args?: { AbsolutePath?: unknown } } | undefined
    if (call?.name === 'view_file' && typeof call.args?.AbsolutePath === 'string') io.used(call.args.AbsolutePath)
  }
  return {}
}
