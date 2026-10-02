import { readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { SubagentCall, SubagentInfo } from '../shared/chat'

const FIELDS = ['file_path', 'path', 'command', 'pattern', 'query', 'url', 'description', 'prompt']

/** A tool call in a few words: the file's name, the command, the pattern. */
export function callDetail(name: string, input: Record<string, unknown>): string {
  const key = FIELDS.find((k) => typeof input[k] === 'string' && input[k])
  if (!key) return ''
  const v = input[key] as string
  return (key === 'file_path' || key === 'path' ? basename(v) : v.replace(/\s+/g, ' ')).slice(0, 60)
}

interface Parsed {
  info: SubagentInfo
  mtime: number
  size: number
}
const cache = new Map<string, Parsed>()

function parse(meta: { agentType?: string; description?: string; toolUseId?: string; spawnDepth?: number; requestShape?: string }, agentId: string, raw: string): SubagentInfo {
  const calls: SubagentCall[] = []
  let startedAt = 0
  let updatedAt = 0
  let done = false
  let result = ''
  let handedBack = false
  const spawns: string[] = []
  for (const l of raw.split('\n')) {
    if (!l) continue
    let d: { type?: string; timestamp?: string; message?: { stop_reason?: string | null; content?: unknown } }
    try {
      d = JSON.parse(l)
    } catch {
      continue
    }
    const at = d.timestamp ? Date.parse(d.timestamp) : 0
    if (at) {
      startedAt ||= at
      updatedAt = Math.max(updatedAt, at)
    }
    // Whatever follows its hand-back (the delivery receipt, a closing line) is not its answer.
    if (handedBack || d.type !== 'assistant' || !Array.isArray(d.message?.content)) continue
    for (const b of d.message!.content as { type?: string; name?: string; input?: Record<string, unknown>; text?: string }[]) {
      // A subagent run in the background reports with this call; what it carries is its answer.
      if (b.type === 'tool_use' && b.name === 'SubagentHandback') {
        done = true
        result = String(b.input?.message ?? '').trim()
        handedBack = true
      } else if (b.type === 'tool_use' && b.name) {
        calls.push({ at, name: b.name, detail: callDetail(b.name, b.input ?? {}) })
        if ((b.name === 'Agent' || b.name === 'Task') && typeof (b as { id?: string }).id === 'string') spawns.push((b as { id: string }).id)
      }
    }
    if (handedBack) continue
    // Its last message with no more calls to make is the answer.
    const text = (d.message!.content as { type?: string; text?: string }[]).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n').trim()
    done = d.message!.stop_reason === 'end_turn'
    result = done ? text : ''
  }
  return { agentId, toolUseId: meta.toolUseId ?? '', type: meta.agentType ?? 'agent', description: meta.description ?? '', startedAt, updatedAt, done, calls, result, depth: meta.spawnDepth ?? 1, background: meta.requestShape === 'background', spawns }
}

/** The subagents a session started, read from `<session folder>/subagents`. A file that cannot be read is skipped. */
export function listSubagents(sessionDir: string): SubagentInfo[] {
  const dir = join(sessionDir, 'subagents')
  let names: string[]
  try {
    names = readdirSync(dir).filter((n) => n.endsWith('.meta.json'))
  } catch {
    return []
  }
  const out: SubagentInfo[] = []
  for (const n of names) {
    const base = n.slice(0, -'.meta.json'.length)
    const file = join(dir, `${base}.jsonl`)
    try {
      const st = statSync(file)
      const hit = cache.get(file)
      if (hit && hit.mtime === st.mtimeMs && hit.size === st.size) {
        out.push(hit.info)
        continue
      }
      const info = parse(JSON.parse(readFileSync(join(dir, n), 'utf8')), base.replace(/^agent-/, ''), readFileSync(file, 'utf8'))
      cache.set(file, { info, mtime: st.mtimeMs, size: st.size })
      out.push(info)
    } catch {
      /* half-written or gone: the next look will have it */
    }
  }
  return out.sort((a, b) => a.startedAt - b.startedAt)
}
