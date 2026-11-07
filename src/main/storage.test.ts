import { linkSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { StorageService, sizeOf } from './storage'

const KB = 1024
const made: string[] = []
const tree = () => made[made.push(mkdtempSync(join(tmpdir(), 'aw-size-'))) - 1]!
const file = (path: string, kb: number) => (mkdirSync(join(path, '..'), { recursive: true }), writeFileSync(path, Buffer.alloc(kb * KB, 1)))
afterEach(() => made.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })))

describe('what a folder takes on disk', () => {
  it('adds up every file, and says how much of it is folders an install brings back', async () => {
    const d = tree()
    file(join(d, 'src/a.ts'), 100)
    file(join(d, 'node_modules/x/index.js'), 400)
    file(join(d, 'dist/main.js'), 200)
    const s = await sizeOf(d)
    expect(s.bytes).toBeGreaterThanOrEqual(700 * KB)
    expect(s.bytes).toBeLessThan(760 * KB)
    expect(s.regen).toBeGreaterThanOrEqual(600 * KB)
    expect(s.regen).toBeLessThan(s.bytes - 90 * KB)
  })

  it('does not follow a symlink, and counts a file linked from two places once', async () => {
    const d = tree()
    const out = tree()
    file(join(out, 'big.bin'), 500)
    file(join(d, 'a/real.bin'), 200)
    symlinkSync(out, join(d, 'link'))
    mkdirSync(join(d, 'b'))
    linkSync(join(d, 'a/real.bin'), join(d, 'b/same.bin'))
    const s = await sizeOf(d)
    expect(s.bytes).toBeGreaterThanOrEqual(200 * KB)
    expect(s.bytes).toBeLessThan(260 * KB)
  })

  it('counts a file shared with an earlier folder only the first time, when the set of seen files is passed on', async () => {
    const a = tree()
    const b = tree()
    file(join(a, 'x.bin'), 300)
    linkSync(join(a, 'x.bin'), join(b, 'x.bin'))
    const seen = new Set<string>()
    expect((await sizeOf(a, seen)).bytes).toBeGreaterThanOrEqual(300 * KB)
    expect((await sizeOf(b, seen)).bytes).toBeLessThan(20 * KB)
  })

  it('is empty for a folder that is not there', async () => {
    expect(await sizeOf(join(tree(), 'nope'))).toEqual({ bytes: 0, regen: 0 })
  })
})

describe('the storage of the workspaces, measured in the background', () => {
  const setup = () => {
    const home = tree()
    const repo = tree()
    const worktrees = join(home, 'worktrees')
    file(join(repo, 'a.txt'), 100)
    file(join(worktrees, 'slug', 'delta', 'b.txt'), 300)
    file(join(worktrees, 'slug', 'gone', 'c.txt'), 200)
    file(join(home, 'ledger.jsonl'), 50)
    const agents = [{ id: 'd', name: 'delta', cwd: join(worktrees, 'slug', 'delta'), repoPath: repo }]
    const make = () => new StorageService({ file: join(home, 'storage.json'), home, worktrees, agents: () => agents, workspaces: () => [repo, join(repo, 'missing')], slug: () => 'slug', now: () => 5 })
    return { home, make }
  }

  it('measures each workspace by place, the app\'s own folder apart, and tells the screen as it goes', async () => {
    const { make } = setup()
    const s = make()
    let told = 0
    s.onChange(() => told++)
    expect(s.report()).toMatchObject({ at: null, workspaces: [] })
    await s.measure()
    const r = s.report()
    expect(r).toMatchObject({ at: 5, measuring: false })
    expect(r.workspaces).toHaveLength(1)
    expect(r.workspaces[0]!.places.map((p) => [p.kind, p.name])).toEqual([['folder', 'Project folder'], ['agent', 'delta'], ['orphan', 'gone']])
    expect(r.data!.places.map((p) => p.name)).toEqual(['ledger.jsonl'])
    expect(told).toBeGreaterThan(1)
  })

  it('asks the disk once when asked twice at the same time, and has the last result at once next time', async () => {
    const { make } = setup()
    const s = make()
    const a = s.measure()
    expect(s.report().measuring).toBe(true)
    expect(s.measure()).toBe(a)
    await a
    expect(make().report()).toMatchObject({ at: 5, measuring: false, workspaces: [{ name: expect.any(String) }] })
  })

  it('keeps only what has the shape of a workspace from a saved file that is not quite right', () => {
    const { home, make } = setup()
    writeFileSync(join(home, 'storage.json'), JSON.stringify({ at: 1, workspaces: [{ name: 'broken' }, { path: '/p', name: 'ok', bytes: 1, places: [] }], data: { name: 'broken' } }))
    expect(make().report()).toMatchObject({ at: 1, workspaces: [{ name: 'ok' }], data: null })
  })
})
