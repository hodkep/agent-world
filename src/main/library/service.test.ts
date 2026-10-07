import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createLibraryService } from './service'

let dir: string
let svc: ReturnType<typeof createLibraryService>
let pushed: string[]
beforeEach(async () => {
  pushed = []
  dir = mkdtempSync(join(tmpdir(), 'aw-svc-'))
  svc = createLibraryService({
    root: join(dir, 'library'),
    agent: (id) => ({ a1: { id: 'a1', name: 'csr-1', repoPath: '/work/shop', provider: 'claude' }, a2: { id: 'a2', name: 'ada', repoPath: '/work/shop', provider: 'agy' }, a3: { id: 'a3', name: 'bo', repoPath: '/work/other', provider: 'claude' } })[id],
    workspaceKey: (p) => p.split('/').pop()!,
    onUse: (id) => void pushed.push(id)
  })
  await svc.library.save({ kind: 'instruction', name: 'Terse', description: 'Talk short.', body: 'Talk short.' })
  const s = join(dir, 'src', 'pdf')
  mkdirSync(join(s, 'scripts'), { recursive: true })
  writeFileSync(join(s, 'SKILL.md'), '---\nname: pdf\ndescription: Work with PDFs.\n---\nUse the scripts.')
  writeFileSync(join(s, 'scripts', 'split.sh'), 'echo split')
  await svc.library.addSkillFolder(s, 't')
  await svc.library.save({ kind: 'prompt', name: 'Secret', description: 'Not for this workspace.', body: 'x' })
  svc.playbooks.write('global', [{ id: 'terse', mode: 'always', when: '', strength: 'medium' }])
  svc.playbooks.write({ workspace: 'shop' }, [{ id: 'pdf', mode: 'on-demand', when: 'working with PDFs', strength: 'soft' }])
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('what an agent is given from the library', () => {
  it('compiles the global playbook with its workspace\'s on top, and nothing from another workspace', async () => {
    const shop = await svc.prepare('a1', true)
    expect(shop.core).toContain('Talk short.')
    expect(shop.core).toContain('working with PDFs: pdf')
    const other = await svc.prepare('a3', true)
    expect(other.core).toContain('Talk short.')
    expect(other.core).not.toContain('pdf')
  })
  it('writes the plugin folder with just the skills allowed, and none when no skill is allowed', async () => {
    const shop = await svc.prepare('a1', true)
    expect(shop.pluginDir && existsSync(join(shop.pluginDir, 'skills', 'pdf', 'SKILL.md'))).toBe(true)
    expect((await svc.prepare('a3', true)).pluginDir).toBeNull()
  })
  it('shows only what the playbook allows in the index, with when and size', async () => {
    const idx = await svc.index('a1')
    expect(idx.map((e) => e.id)).toEqual(['terse', 'pdf'])
    expect(idx[1]).toMatchObject({ kind: 'skill', mode: 'on-demand', when: 'working with PDFs', description: 'Work with PDFs.' })
    expect((await svc.index('a1')).some((e) => e.id === 'secret')).toBe(false)
  })
  it('gives an item\'s text, with the absolute path of a skill\'s files, and refuses anything outside the playbook', async () => {
    const text = await svc.get('a1', 'pdf')
    expect(text).toContain('Use the scripts.')
    expect(text).toContain(join(dir, 'library', 'skills', 'pdf', 'scripts', 'split.sh'))
    await expect(svc.get('a1', 'secret')).rejects.toThrow('not in this workspace')
    await expect(svc.get('a3', 'pdf')).rejects.toThrow('not in this workspace')
    await expect(svc.get('a1', 'nope')).rejects.toThrow('not in this workspace')
  })
  it('reads one file of a skill by its relative name, and nothing that leaves the skill', async () => {
    expect(await svc.get('a1', 'pdf', 'scripts/split.sh')).toContain('echo split')
    await expect(svc.get('a1', 'pdf', '../../../../etc/passwd')).rejects.toThrow()
    // A link planted inside the skill must not lead out of it, to a file or a folder.
    writeFileSync(join(dir, 'outside.txt'), 'private')
    symlinkSync(join(dir, 'outside.txt'), join(dir, 'library', 'skills', 'pdf', 'leak.txt'))
    symlinkSync(dir, join(dir, 'library', 'skills', 'pdf', 'out'))
    await expect(svc.get('a1', 'pdf', 'leak.txt')).rejects.toThrow()
    await expect(svc.get('a1', 'pdf', 'out/outside.txt')).rejects.toThrow()
    await expect(svc.get('a1', 'pdf', 'missing.txt')).rejects.toThrow()
  })
  it('searches the allowed items by their words', async () => {
    expect((await svc.search('a1', 'pdf')).map((e) => e.id)).toEqual(['pdf'])
    expect((await svc.search('a1', 'talk short')).map((e) => e.id)).toEqual(['terse'])
    expect(await svc.search('a1', 'secret')).toEqual([])
  })
  it('records every fetch with who asked, and counts them by program', async () => {
    await svc.get('a1', 'pdf')
    await svc.get('a2', 'pdf')
    await svc.get('a1', 'terse')
    await svc.get('a1', 'secret').catch(() => {})
    expect(readFileSync(join(dir, 'library', 'uses.jsonl'), 'utf8').trim().split('\n')).toHaveLength(3)
    expect(await svc.usage()).toEqual({ pdf: { claude: 1, agy: 1, total: 2 }, terse: { claude: 1, agy: 0, total: 1 } })
  })

  describe('keeping the agent pointed at the library', () => {
    it('writes the catalog to a file and tells the agent where it is, only when something is on demand', async () => {
      const shop = await svc.prepare('a1', true)
      const file = join(dir, 'library', 'catalog', 'shop.md')
      expect(shop.core).toContain(file)
      expect(readFileSync(file, 'utf8')).toContain('- pdf: working with PDFs')
      expect((await svc.prepare('a3', true)).core).not.toContain('catalog')
    })
    it('points at the item a prompt matches, and logs it as triggered', async () => {
      await svc.prepare('a1', true, true)
      const r = svc.remind('a1', 'split this pdf into pages')
      expect(r).toContain("library_get('pdf')")
      expect(svc.remind('a1', 'rename the lamp post')).not.toContain('pdf')
      expect(svc.stats().items.pdf).toMatchObject({ triggered: 1, answered: 0 })
    })
    it('counts a trigger as answered when the agent then fetches the item in the same turn', async () => {
      await svc.prepare('a1', true)
      svc.remind('a1', 'split this pdf into pages')
      await svc.get('a1', 'pdf')
      expect(svc.stats().items.pdf).toMatchObject({ triggered: 1, answered: 1, used: 1 })
    })
    it('names the skill where the program loads skills, and gives the file path where it does not (even if it could ask the office)', async () => {
      await svc.prepare('a1', false, true)
      expect(svc.remind('a1', 'split this pdf')).toContain('Use the pdf skill')
      await svc.prepare('a1', false, false)
      expect(svc.remind('a1', 'split this pdf')).toContain(join(dir, 'library', 'skills', 'pdf', 'SKILL.md'))
      await svc.prepare('a1', true, false)
      expect(svc.remind('a1', 'split this pdf')).toContain(join(dir, 'library', 'skills', 'pdf', 'SKILL.md'))
    })
    it('adds the whole catalog every tenth prompt and right after a compaction', async () => {
      await svc.prepare('a1', true)
      const catalogs = Array.from({ length: 10 }, () => svc.remind('a1', 'nothing relevant')).filter((r) => r.includes('Library items and when each applies'))
      expect(catalogs).toHaveLength(1)
      svc.refresh('a1')
      expect(svc.remind('a1', 'nothing relevant')).toContain('Library items and when each applies')
      expect(svc.remind('a1', 'nothing relevant')).not.toContain('Library items and when each applies')
    })
    it('records what was delivered at launch and what the hooks saw', async () => {
      await svc.prepare('a1', true)
      svc.record('a1', 'pdf', 'skill')
      expect(svc.stats().items.terse).toMatchObject({ delivered: 1 })
      expect(svc.stats().items.pdf).toMatchObject({ used: 1 })
      svc.record('a1', 'not-in-library', 'skill')
      expect(svc.stats().items['not-in-library']).toBeUndefined()
    })
  })

  describe('what the screen is shown', () => {
    it('keeps the exact words pointed at an agent and the opening text it started with, for that agent only', async () => {
      await svc.prepare('a1', true, true)
      svc.remind('a1', 'split this pdf into pages')
      await svc.get('a1', 'pdf')
      await svc.prepare('a3', true, true)
      const uses = svc.usesOf('a1')
      expect(uses.map((u) => u.how)).toEqual(['started', 'delivered', 'triggered', 'fetched'])
      expect(uses[0]!.words).toContain('Talk short.')
      expect(uses.find((u) => u.how === 'triggered')!.words).toContain("this task matches pdf")
      expect(uses.every((u) => u.agent === 'a1')).toBe(true)
    })
    it('tells the app when an agent has a new entry, and does not count a start as a use', async () => {
      await svc.prepare('a1', true)
      svc.remind('a1', 'split this pdf into pages')
      expect(pushed).toContain('a1')
      expect(svc.stats().items.terse).toMatchObject({ delivered: 1, used: 0 })
      expect(Object.keys(svc.stats().items)).not.toContain('')
    })
  })
})
