import { describe, expect, it, vi } from 'vitest'
import { type WrapUpAgent, type WrapUpDeps, wrapUp } from './wrapUp'

const agents: WrapUpAgent[] = [
  { id: 'a', name: 'ada', cwd: '/wt/ada', branch: 'aw/ada' },
  { id: 'b', name: 'linus', cwd: '/wt/linus', branch: 'aw/linus' },
  { id: 'c', name: 'grace', cwd: '/repo', branch: null }
]

const deps = (over: Partial<WrapUpDeps> = {}): WrapUpDeps => ({
  pidOf: (id) => ({ a: 10, b: 20, c: 30 })[id],
  listProcs: async (root) => (root === 10 ? [{ pid: 11, command: 'pnpm dev', age: 60 }, { pid: 12, command: 'sleep 300', age: 30 }] : []),
  stopProc: vi.fn(async () => true),
  dirty: async (cwd) => cwd === '/wt/ada' || cwd === '/repo',
  commit: vi.fn(async () => {}),
  ...over
})

describe('wrapping up before the app closes', () => {
  it('stops what the agents started and commits unfinished work on their own branches', async () => {
    const d = deps()
    const r = await wrapUp(agents, d)
    expect(r.stopped).toBe(2)
    expect(d.stopProc).toHaveBeenCalledWith(10, 11)
    expect(d.stopProc).toHaveBeenCalledWith(10, 12)
    // Only ada has changes in a worktree of her own; grace works in the shared folder and is left alone.
    expect(d.commit).toHaveBeenCalledTimes(1)
    expect(d.commit).toHaveBeenCalledWith('/wt/ada', 'chore(ada): work in progress')
    expect(r.committed).toEqual(['ada'])
    expect(r.failed).toEqual([])
  })

  it('stops commands but commits nothing when asked to leave the work alone (a dev restart)', async () => {
    const d = deps()
    const r = await wrapUp(agents, d, { commit: false })
    expect(r.stopped).toBe(2)
    expect(d.commit).not.toHaveBeenCalled()
    expect(r.committed).toEqual([])
  })

  it('does not commit a clean worktree', async () => {
    const d = deps({ dirty: async () => false })
    expect((await wrapUp(agents, d)).committed).toEqual([])
    expect(d.commit).not.toHaveBeenCalled()
  })

  it('reports a step that fails and carries on with the others', async () => {
    const d = deps({
      listProcs: async () => {
        throw new Error('ps failed')
      },
      commit: vi.fn(async (cwd: string) => {
        if (cwd === '/wt/ada') throw new Error('hook rejected')
      }),
      dirty: async () => true
    })
    const r = await wrapUp(agents, d)
    expect(r.failed).toContain('ada: could not commit')
    expect(r.failed).toContain('ada: could not stop its commands')
    expect(r.committed).toEqual(['linus'])
  })

  it('gives up waiting after its time limit', async () => {
    const d = deps({ dirty: () => new Promise(() => {}) })
    const t = Date.now()
    await wrapUp(agents, d, { timeoutMs: 100 })
    expect(Date.now() - t).toBeLessThan(2000)
  })
})
