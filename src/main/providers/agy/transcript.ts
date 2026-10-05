import { existsSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { ChatItem, SubagentInfo } from '../../../shared/chat'
import type { AgentRecord } from '../../../shared/types'
import type { PastSession, TranscriptSource } from '../ports'
import { FINISHED, decodeStep, json, stepTime, sumUsage, toolView, usageOf, type StepRow } from './steps'
import { all, text } from './wire'

/** agy keeps its state under one folder; the environment can point elsewhere (tests, other machines). */
export const agyHome = () => process.env.AW_AGY_HOME ?? join(homedir(), '.gemini', 'antigravity-cli')
export const conversationFile = (id: string) => join(agyHome(), 'conversations', `${id}.db`)

/** Steps after `after`, opened read-only for a moment: agy is writing the file, and a held connection would hold up its saves. */
function stepsAfter(file: string, after: number): StepRow[] {
  if (!existsSync(file)) return []
  let db: DatabaseSync | undefined
  try {
    db = new DatabaseSync(file, { readOnly: true })
    const rows = db.prepare('select idx, step_type as type, status, step_payload as payload from steps where idx > ? order by idx').all(after) as unknown as { idx: number; type: number; status: number; payload: Uint8Array | null }[]
    return rows.map((r) => ({ ...r, payload: r.payload ? Buffer.from(r.payload) : null }))
  } catch {
    return []
  } finally {
    db?.close()
  }
}

const known = new Map<string, string>()
/** The folder a conversation runs in, which its first step records as a file address; unknown until that step is saved. */
export function conversationWorkspace(id: string): string | undefined {
  const hit = known.get(id)
  if (hit) return hit
  const first = stepsAfter(conversationFile(id), -1).find((r) => r.type === 14)
  const uri = text(first?.payload, '19.12.12')
  const path = uri?.startsWith('file://') ? decodeURIComponent(uri.slice('file://'.length)) : undefined
  if (path) known.set(id, path)
  return path
}

/** Finished steps, in order, up to the first one still being worked on: nothing is shown half-done or out of order. */
const ready = (rows: StepRow[]) => {
  const out: StepRow[] = []
  for (const r of rows) {
    if (!FINISHED.has(r.status)) break
    out.push(r)
  }
  return out
}

/** The newest step number in a conversation, or null when there is no file or no step yet. */
function lastStep(file: string): number | null {
  if (!existsSync(file)) return null
  let db: DatabaseSync | undefined
  try {
    db = new DatabaseSync(file, { readOnly: true })
    return ((db.prepare('select max(idx) as top from steps').get() as { top: number | null } | undefined)?.top) ?? null
  } catch {
    return null
  } finally {
    db?.close()
  }
}

class AgyTail {
  private after = -1
  private timer: ReturnType<typeof setInterval> | null = null
  constructor(
    private readonly file: string,
    private readonly onItems: (items: ChatItem[], replace: boolean) => void
  ) {}
  start(everyMs = 1000) {
    this.poll()
    this.timer = setInterval(() => this.poll(), everyMs)
  }
  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }
  poll() {
    // A rewind removes the later steps from this same file: fewer steps than were shown means what is shown is out of date.
    const top = lastStep(this.file)
    const rewound = top !== null && top < this.after
    if (rewound) this.after = -1
    const rows = ready(stepsAfter(this.file, this.after))
    if (!rows.length) return void (rewound && this.onItems([], true))
    this.after = rows.at(-1)!.idx
    const items = rows.flatMap(decodeStep)
    if (items.length || rewound) this.onItems(items, rewound)
  }
}

interface HistoryLine {
  display?: string
  timestamp?: number
  workspace?: string
  conversationId?: string
}

/** A short look at what a call was given: the command, the file, or the first thing written. */
function detailOf(input: Record<string, unknown>): string {
  const v = input.command ?? input.AbsolutePath ?? input.Path ?? Object.values(input).find((x) => typeof x === 'string')
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').slice(0, 60) : ''
}

/**
 * Subagents have conversations of their own, named in the answer to the call that started them (`invoke_subagent`), so each is read from
 * its own file: what it was asked, the calls it made, and its answer once its last step is a reply with nothing left to call.
 */
function subagentsOf(parent: AgentRecord): SubagentInfo[] {
  const out: SubagentInfo[] = []
  for (const r of stepsAfter(conversationFile(parent.sessionId), -1)) {
    if (r.type !== 132 || text(r.payload, '5.4.2') !== 'invoke_subagent') continue
    const asked = ((json(text(r.payload, '5.4.3')).Subagents as { Prompt?: string; Role?: string; TypeName?: string }[] | undefined) ?? [])
    const ids = [...(text(r.payload, '140.2.1') ?? '').matchAll(/"conversationId":\s*"([0-9a-zA-Z-]+)"/g)].map((m) => m[1]!)
    ids.forEach((id, i) => {
      const rows = stepsAfter(conversationFile(id), -1)
      const last = rows.at(-1)
      const calls = rows.filter((c) => c.type === 132 && FINISHED.has(c.status)).map((c) => ({ at: stepTime(c.payload), name: toolView(text(c.payload, '5.4.2') ?? 'tool', json(text(c.payload, '5.4.3'))).name, detail: detailOf(toolView('x', json(text(c.payload, '5.4.3'))).input) }))
      const done = !!last && last.type === 15 && FINISHED.has(last.status) && all(last.payload, '20.7').length === 0
      out.push({
        agentId: id,
        toolUseId: text(r.payload, '5.4.1') ?? '',
        type: asked[i]?.TypeName ?? 'subagent',
        description: asked[i]?.Role ?? (asked[i]?.Prompt ?? '').slice(0, 80),
        startedAt: stepTime(rows[0]?.payload ?? null) || stepTime(r.payload),
        updatedAt: stepTime(last?.payload ?? null) || stepTime(r.payload),
        done,
        calls,
        result: done ? (text(last!.payload, '20.1') ?? '').trim() : '',
        depth: 1,
        background: false,
        spawns: [],
        stopped: !!last && (last.status === 6 || last.status === 7)
      })
    })
  }
  return out
}

export const agyTranscript: TranscriptSource = {
  follow: (a, onItems) => new AgyTail(conversationFile(a.sessionId), onItems),
  readAll: (a) => ready(stepsAfter(conversationFile(a.sessionId), -1)).flatMap(decodeStep),
  subagents: (a) => subagentsOf(a),
  usage: (a) => sumUsage(stepsAfter(conversationFile(a.sessionId), -1).filter((r) => r.type === 15 && FINISHED.has(r.status)).map((r) => usageOf(r.payload))),
  /** agy appends a line per prompt to its history: group them by conversation, for this folder and the worktrees made under it. */
  async history(folder, worktreeRoot) {
    let lines: HistoryLine[]
    try {
      lines = readFileSync(join(agyHome(), 'history.jsonl'), 'utf8').split('\n').flatMap((l) => {
        try {
          return l.trim() ? [JSON.parse(l) as HistoryLine] : []
        } catch {
          return []
        }
      })
    } catch {
      return []
    }
    const mine = (w = '') => w === folder || w.startsWith(`${worktreeRoot}/`)
    const found = new Map<string, PastSession>()
    for (const l of lines) {
      if (!l.conversationId || !l.display || !mine(l.workspace)) continue
      const have = found.get(l.conversationId)
      const at = l.timestamp ?? 0
      if (have) have.updated = Math.max(have.updated, at)
      else {
        let bytes = 0
        try {
          bytes = statSync(conversationFile(l.conversationId)).size
        } catch {
          /* the conversation file is gone; the line is still worth showing */
        }
        found.set(l.conversationId, { id: l.conversationId, title: l.display.slice(0, 160), updated: at, bytes })
      }
    }
    return [...found.values()].sort((a, b) => b.updated - a.updated).slice(0, 40)
  },
  forkedSession: () => null,
  forgetInstructions: () => {}
}
