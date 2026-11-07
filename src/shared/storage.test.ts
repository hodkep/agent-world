import { describe, expect, it } from 'vitest'
import { arrange, recommend, type Who } from './storage'

const GB = 1024 ** 3
const NOW = Date.UTC(2026, 10, 7, 12)
const HOUR = 3_600_000
const W = '/home/u/.agent-world/worktrees/app-1'
const who = (name: string, over: Partial<Who> = {}): Who => ({ id: name, name, cwd: `${W}/${name}`, activeAt: NOW - HOUR / 2, ...over })
const dir = (name: string, bytes: number, regen = 0) => [`${W}/${name}`, { bytes, regen }] as const
const make = (agents: Who[], dirs: (readonly [string, { bytes: number; regen: number }])[], folder = { bytes: 0.7 * GB, regen: 0 }) => arrange({ path: '/repo/app', name: 'app', agents, folder, dirs: Object.fromEntries(dirs), now: NOW })
const rows = (s: ReturnType<typeof make>) => s.places.map((p) => [p.kind, p.name, p.bytes / GB, p.of])

describe('where a workspace\'s agents work, and what each place takes', () => {
  it('puts the project folder first, naming the agents that work in it and saying they add nothing', () => {
    const s = make([who('os', { cwd: '/repo/app' }), who('tester', { cwd: '/repo/app' })], [])
    expect(s.places).toHaveLength(1)
    expect(s.places[0]).toMatchObject({ kind: 'folder', name: 'Project folder', note: 'os, tester work here', bytes: 0.7 * GB })
    expect(make([], []).places[0]!.note).toBe('no agent works here')
  })

  it('lists each agent\'s worktree biggest first, and adds the places up to the workspace total', () => {
    const s = make([who('delta'), who('cocain', { activeAt: NOW - 9 * 24 * HOUR })], [dir('cocain', 1.4 * GB), dir('delta', 2.7 * GB)])
    expect(rows(s)).toEqual([['folder', 'Project folder', 0.7, undefined], ['agent', 'delta', 2.7, undefined], ['agent', 'cocain', 1.4, undefined]])
    expect(s.places[1]!.note).toBe('worktree · last active under an hour ago')
    expect(s.places[2]!.note).toBe('worktree · last active 9 days ago')
    expect(s.bytes).toBeCloseTo(4.8 * GB, -3)
  })

  it('puts a subagent under its parent: nothing of its own when it shares the folder, its own size when it has a folder', () => {
    const agents = [who('delta'), who('review-1', { parent: 'delta', cwd: `${W}/delta` }), who('build-2', { parent: 'delta' })]
    const s = make(agents, [dir('delta', 2.7 * GB), dir('build-2', 0.5 * GB)])
    expect(rows(s).slice(1)).toEqual([['agent', 'delta', 2.7, undefined], ['sub', 'build-2', 0.5, 'delta'], ['sub', 'review-1', 0, 'delta']])
    expect(s.places.find((p) => p.name === 'review-1')!.note).toBe('subagent · shares delta\'s folder')
    expect(s.places.find((p) => p.name === 'build-2')!.note).toBe('subagent · own folder')
  })

  it('shows a folder no agent owns last, as an orphan', () => {
    const s = make([who('delta')], [dir('old-pr-fix', 0.5 * GB), dir('delta', 2.7 * GB)])
    expect(rows(s).slice(1).map((r) => r.slice(0, 2))).toEqual([['agent', 'delta'], ['orphan', 'old-pr-fix']])
    expect(s.places.at(-1)!.note).toBe('no agent')
  })
})

describe('what could be freed', () => {
  it('counts the reinstallable folders of the agents\' worktrees, not of the project\'s own folder nor of an orphan (freed whole), and names the orphans', () => {
    const s = make([who('delta')], [dir('delta', 2.7 * GB, 1.2 * GB), dir('old', 0.5 * GB, 0.2 * GB)], { bytes: 0.7 * GB, regen: 0.3 * GB })
    const tips = recommend(s)
    expect(tips.map((t) => [t.bytes / GB, t.text])).toEqual([[1.2, expect.stringContaining('1 worktree.')], [0.5, expect.stringContaining('old')]])
    expect(tips[1]!.cmd).toBe('git worktree remove <path>')
  })

  it('says nothing when there is nothing to free', () => {
    expect(recommend(make([who('delta')], [dir('delta', 1 * GB)]))).toEqual([])
  })
})
