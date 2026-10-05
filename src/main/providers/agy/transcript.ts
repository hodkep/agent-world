import { existsSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { ChatItem } from '../../../shared/chat'
import type { AgentRecord } from '../../../shared/types'
import type { PastSession, TranscriptSource } from '../ports'
import { FINISHED, decodeStep, type StepRow } from './steps'

/** agy keeps its state under one folder; the environment can point elsewhere (tests, other machines). */
export const agyHome = () => process.env.AW_AGY_HOME ?? join(homedir(), '.gemini', 'antigravity-cli')
const conversationFile = (id: string) => join(agyHome(), 'conversations', `${id}.db`)

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

/** Finished steps, in order, up to the first one still being worked on: nothing is shown half-done or out of order. */
const ready = (rows: StepRow[]) => {
  const out: StepRow[] = []
  for (const r of rows) {
    if (!FINISHED.has(r.status)) break
    out.push(r)
  }
  return out
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
    const rows = ready(stepsAfter(this.file, this.after))
    if (!rows.length) return
    this.after = rows.at(-1)!.idx
    const items = rows.flatMap(decodeStep)
    if (items.length) this.onItems(items, false)
  }
}

interface HistoryLine {
  display?: string
  timestamp?: number
  workspace?: string
  conversationId?: string
}

export const agyTranscript: TranscriptSource = {
  follow: (a, onItems) => new AgyTail(conversationFile(a.sessionId), onItems),
  readAll: (a) => ready(stepsAfter(conversationFile(a.sessionId), -1)).flatMap(decodeStep),
  subagents: () => [],
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
