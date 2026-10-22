import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { readdir, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { ChatItem } from '../../../shared/chat'
import type { AgentRecord } from '../../../shared/types'
import type { TranscriptSource } from '../ports'
import { newestSession, transcriptPath } from './chat'
import { TranscriptTail } from './chatTail'
import { dropPromptSnapshots } from './promptSnapshot'
import { listSessions, projectSlug } from './history'
import { listSubagents, readSubagentConversation } from './subagents'

const projectsDir = (a?: AgentRecord) => process.env.AW_CLAUDE_PROJECTS ?? join(a?.configDir ?? join(homedir(), '.claude'), 'projects')

// Claude names the project folder after the real path of its working directory (symlinks resolved).
function file(a: AgentRecord) {
  let real = a.cwd
  try {
    real = realpathSync(a.cwd)
  } catch {
    /* the folder is gone; the transcript will not appear */
  }
  return transcriptPath(projectsDir(a), real, a.sessionId)
}

// Counting a long conversation twice for the same file size is wasted work.
const read = new Map<string, { size: number; items: ChatItem[] }>()

export const claudeTranscript: TranscriptSource = {
  exists: (a) => existsSync(file(a)),
  follow: (a, onItems) => new TranscriptTail(file(a), onItems),
  readAll(a) {
    const f = file(a)
    let items: ChatItem[] = []
    try {
      const size = statSync(f).size
      const hit = read.get(f)
      if (hit && hit.size === size) return hit.items
      new TranscriptTail(f, (got, replace) => (items = replace ? got : [...items, ...got])).poll()
      read.set(f, { size, items })
    } catch {
      /* no conversation yet */
    }
    return items
  },
  subagents: (a) => listSubagents(file(a).replace(/\.jsonl$/, '')),
  subagentConversation: (a, id) => readSubagentConversation(file(a).replace(/\.jsonl$/, ''), id),
  async history(folder, worktreeRoot) {
    const dir = projectsDir()
    let all: string[] = []
    try {
      all = await readdir(dir)
    } catch {
      /* no Claude history yet */
    }
    const prefix = projectSlug(worktreeRoot) + '-'
    return listSessions(dir, [projectSlug(await realpath(folder)), ...all.filter((d) => d.startsWith(prefix))])
  },
  forkedSession: (a, sinceMs) => newestSession(dirname(file(a)), a.sessionId, sinceMs),
  forgetInstructions: (a) => void dropPromptSnapshots(file(a))
}
