import type { ProcInfo } from '../shared/types'

export interface WrapUpAgent {
  id: string
  name: string
  cwd: string
  /** Only an agent with a branch of its own works in a worktree that is safe to commit in. */
  branch: string | null
}

export interface WrapUpDeps {
  /** The terminal's process id, when the agent is running. */
  pidOf: (id: string) => number | undefined
  listProcs: (root: number) => Promise<ProcInfo[]>
  stopProc: (root: number, pid: number) => Promise<boolean>
  dirty: (cwd: string) => Promise<boolean>
  commit: (cwd: string, message: string) => Promise<void>
}

export interface WrapUpResult {
  stopped: number
  committed: string[]
  failed: string[]
}

/**
 * What to do before the app closes: stop the commands the agents left running, and commit each agent's unfinished
 * work to its own branch, so nothing is lost or left running behind the window. A step that fails is reported, not fatal.
 */
export async function wrapUp(agents: WrapUpAgent[], d: WrapUpDeps, o: { timeoutMs?: number; /** False leaves unfinished work uncommitted. */ commit?: boolean } = {}): Promise<WrapUpResult> {
  const result: WrapUpResult = { stopped: 0, committed: [], failed: [] }
  const one = async (a: WrapUpAgent) => {
    const pid = d.pidOf(a.id)
    if (pid !== undefined) {
      try {
        for (const p of await d.listProcs(pid)) if (await d.stopProc(pid, p.pid)) result.stopped++
      } catch {
        result.failed.push(`${a.name}: could not stop its commands`)
      }
    }
    if (!a.branch || o.commit === false) return
    try {
      if (await d.dirty(a.cwd)) {
        await d.commit(a.cwd, `chore(${a.name}): work in progress`)
        result.committed.push(a.name)
      }
    } catch {
      result.failed.push(`${a.name}: could not commit`)
    }
  }
  const all = Promise.allSettled(agents.map(one))
  await Promise.race([all, new Promise((r) => setTimeout(r, o.timeoutMs ?? 10_000))])
  return result
}
