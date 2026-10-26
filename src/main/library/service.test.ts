import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createLibraryService } from './service'
import { FORCED_CHECK_TOKENS } from '../../shared/library'

let dir: string
let svc: ReturnType<typeof createLibraryService>
let pushed: string[]
let pushedItems: string[]
// The skills each agent's open task names on its steps, as the office reports them.
let granted: Record<string, string[]>
beforeEach(async () => {
  pushed = []
  pushedItems = []
  granted = {}
  dir = mkdtempSync(join(tmpdir(), 'aw-svc-'))
  svc = createLibraryService({
    root: join(dir, 'library'),
    agent: (id) => ({ a1: { id: 'a1', name: 'csr-1', repoPath: '/work/shop', provider: 'claude' }, a2: { id: 'a2', name: 'ada', repoPath: '/work/shop', provider: 'agy', viaHook: true }, a3: { id: 'a3', name: 'bo', repoPath: '/work/other', provider: 'claude' } })[id],
    workspaceKey: (p) => p.split('/').pop()!,
    grants: (id) => granted[id] ?? [],
    onUse: (id, how, item) => void (pushed.push(`${id}:${how}`), pushedItems.push(item))
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
const rulebook = (strength: 'soft' | 'medium' | 'hard') => svc.playbooks.write({ workspace: 'shop' }, [{ id: 'pdf', mode: 'on-demand', when: 'working with PDFs', strength }])

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
    it('gives the app\'s own drawing rule to an agent that can fetch, but to one that cannot only what the person set up, and a built-in alone is not a Library tab', async () => {
      await svc.library.save({ kind: 'instruction', name: 'chat-visuals', description: 'Draw.', body: 'Draw diagrams.' })
      svc.playbooks.write('global', [{ id: 'chat-visuals', mode: 'always', when: '', strength: 'medium' }])
      svc.playbooks.write({ workspace: 'shop' }, [])
      expect((await svc.prepare('a1', true)).core).toContain('Draw diagrams.')
      expect((await svc.prepare('a2', false)).core).toBe('')
      expect(svc.usesOf('a1').filter((u) => u.how !== 'started' || u.words)).toEqual([])
    })
    it('does not point an agent that cannot reach the library tools at its catalog, or ask it to call them', async () => {
      const core = (await svc.prepare('a1', false)).core
      expect(core).not.toContain('catalog')
      expect(core).not.toContain('library_skip')
    })
    it('never reads the message: the same words come whatever is said, and none points at an item for a word in it', async () => {
      rulebook('hard')
      await svc.prepare('a1', true, true)
      const a = svc.remind('a1', 'start working on this pdf')
      expect(a).not.toMatch(/covers this kind of work/)
      await svc.prepare('a3', true, true)
      expect(svc.remind('a3', 'rename the lamp post')).not.toContain('pdf')
      await svc.prepare('a1', true, true)
      expect(svc.remind('a1', 'rename the lamp post')).toBe(a)
    })
    it('sends the rulebook at the start and every sixth message, for a hard and a medium rule alike, and a soft rule only in the opening text', async () => {
      const shown = async (s: 'soft' | 'medium' | 'hard') => (rulebook(s), await svc.prepare('a1', true, true), Array.from({ length: 13 }, () => svc.remind('a1', 'x').includes('pdf (working with PDFs)')))
      const T = true
      const F = false
      expect(await shown('hard')).toEqual([T, F, F, F, F, F, T, F, F, F, F, F, T])
      expect(await shown('medium')).toEqual([T, F, F, F, F, F, T, F, F, F, F, F, T])
      expect(await shown('soft')).toEqual([F, F, F, F, F, F, F, F, F, F, F, F, F])
      expect((await svc.prepare('a1', true, true)).core).toContain('working with PDFs: pdf')
    })
    it('sends it again right after a compaction, and when the agent comes back after a long pause', async () => {
      rulebook('hard')
      let now = 1_000_000
      svc = createLibraryService({ root: join(dir, 'library'), agent: (id) => ({ id, name: 'csr-1', repoPath: '/work/shop', provider: 'claude' }), workspaceKey: (p) => p.split('/').pop()!, now: () => now })
      await svc.prepare('a1', true, true)
      const has = () => svc.remind('a1', 'x').includes('pdf (working with PDFs)')
      // right after a compaction
      expect([has(), has()]).toEqual([true, false])
      svc.refresh('a1')
      expect(has()).toBe(true)
      expect(has()).toBe(false)
      // after a long pause, once, and not after a short one
      await svc.prepare('a1', true, true)
      expect([has(), has()]).toEqual([true, false])
      now += 5 * 60_000
      expect(has()).toBe(false)
      now += 61 * 60_000
      expect(has()).toBe(true)
    })
    it('logs a rule as triggered each time the rulebook is sent, until the agent reads it, and again after it loses its context', async () => {
      rulebook('hard')
      await svc.prepare('a1', true, true)
      for (let i = 0; i < 7; i++) svc.remind('a1', 'x')
      expect(svc.stats().items.pdf!.triggered).toBe(2)
      svc.record('a1', 'pdf', 'fetched')
      for (let i = 0; i < 6; i++) svc.remind('a1', 'x')
      expect(svc.stats().items.pdf!.triggered).toBe(2)
      svc.refresh('a1')
      svc.remind('a1', 'x')
      expect(svc.stats().items.pdf!.triggered).toBe(3)
    })
    it('notes on each reminder whether the prompt looked related to the rule, and keeps nothing of the prompt itself', async () => {
      rulebook('hard')
      await svc.prepare('a1', true, true)
      svc.remind('a1', 'start working on this pdf')
      for (let i = 0; i < 5; i++) svc.remind('a1', 'rename the lamp post')
      svc.remind('a1', 'rename the lamp post')
      const triggered = svc.usesOf('a1').filter((u) => u.how === 'triggered')
      expect(triggered.map((u) => u.related)).toEqual([true, false])
      expect(JSON.stringify(svc.usesOf('a1'))).not.toContain('lamp post')
      expect(svc.stats().items.pdf).toMatchObject({ triggered: 2, related: 1 })
    })
    it('counts a trigger as answered when the agent then fetches the item in the same turn', async () => {
      rulebook('hard')
      await svc.prepare('a1', true)
      svc.remind('a1', 'x')
      await svc.get('a1', 'pdf')
      expect(svc.stats().items.pdf).toMatchObject({ triggered: 1, answered: 1, used: 1 })
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
    it('keeps the exact words the rulebook gave an agent and the opening text it started with, for that agent only', async () => {
      rulebook('hard')
      await svc.prepare('a1', true, true)
      svc.remind('a1', 'x')
      await svc.get('a1', 'pdf')
      await svc.prepare('a3', true, true)
      const uses = svc.usesOf('a1')
      expect(uses.map((u) => u.how)).toEqual(['started', 'delivered', 'triggered', 'fetched'])
      expect(uses[0]!.words).toContain('Talk short.')
      expect(uses.find((u) => u.how === 'triggered')!.words).toContain('pdf (working with PDFs)')
      expect(uses.every((u) => u.agent === 'a1')).toBe(true)
    })
    it('tells the app which item an agent used, so the office can say what it is reading', async () => {
      await svc.prepare('a1', true)
      await svc.get('a1', 'pdf')
      expect(pushed).toContain('a1:fetched')
      expect(pushedItems.at(-1)).toBe('pdf')
    })
    it('tells the app when an agent has a new entry, and does not count a start as a use', async () => {
      rulebook('hard')
      await svc.prepare('a1', true)
      svc.remind('a1', 'x')
      expect(pushed).toContain('a1:triggered')
      expect(svc.stats().items.terse).toMatchObject({ delivered: 1, used: 0 })
      expect(Object.keys(svc.stats().items)).not.toContain('')
    })
  })

  describe('agents started on an older playbook', () => {
    const later = () => new Promise((r) => setTimeout(r, 25))
    it('names the agents of a workspace that started before its playbook (or the global one) last changed, and no one else', async () => {
      await svc.prepare('a1', true)
      await svc.prepare('a3', true)
      await later()
      expect(svc.staleAgents('/work/shop')).toEqual([])
      svc.playbooks.write({ workspace: 'shop' }, [{ id: 'pdf', mode: 'on-demand', when: 'pdfs', strength: 'soft' }])
      expect(svc.staleAgents('/work/shop')).toEqual([{ id: 'a1', name: 'csr-1' }])
      expect(svc.staleAgents('/work/other')).toEqual([])
      await later()
      await svc.prepare('a1', true)
      expect(svc.staleAgents('/work/shop')).toEqual([])
      await later()
      svc.playbooks.write('global', [])
      expect(svc.staleAgents('/work/other')).toEqual([{ id: 'a3', name: 'bo' }])
      // Everyone who got an opening text is listed, with the program and whether the text is the current one.
      expect(svc.holders('/work/shop')).toEqual([{ id: 'a1', name: 'csr-1', provider: 'claude', stale: true }])
      expect(svc.holders('/work/other')).toEqual([{ id: 'a3', name: 'bo', provider: 'claude', stale: true }])
    })
  })

  describe('a program whose hooks never reach the office', () => {
    it('names an agent that worked after it started and never called the office, and clears once it does', async () => {
      await svc.prepare('a2', false)
      const busyLater = () => Date.now() + 60_000
      // Idle since it started: nothing to say yet.
      expect(svc.silent('/work/shop', () => 0)).toEqual([])
      // It worked, and the office heard nothing from its hooks.
      expect(svc.silent('/work/shop', busyLater)).toEqual([{ id: 'a2', name: 'ada' }])
      svc.hookCalled('a2')
      expect(svc.silent('/work/shop', busyLater)).toEqual([])
    })
    it('does not expect hooks from a program that reports another way', async () => {
      await svc.prepare('a1', true)
      expect(svc.silent('/work/shop', () => Date.now() + 60_000)).toEqual([])
    })
  })
})

describe('the forced check on a hard rule', () => {
  beforeEach(() => svc.playbooks.write({ workspace: 'shop' }, [{ id: 'pdf', mode: 'on-demand', when: 'working with PDFs', strength: 'hard' }]))
  it('asks the agent to say which rules apply, read the one that does, and report one it passes over', async () => {
    await svc.prepare('a1', true)
    const r = svc.remind('a1', 'rename the lamp post')
    expect(r).toContain('pdf (working with PDFs).')
    expect(r).toMatch(/decide silently which of these apply.*do not mention this in your reply/i)
    expect(r).toContain("library_get('pdf')")
    expect(r).toContain('library_skip')
  })
  it('does not add it for a medium rule, or to an agent that cannot call the tools', async () => {
    svc.playbooks.write({ workspace: 'shop' }, [{ id: 'pdf', mode: 'on-demand', when: 'working with PDFs', strength: 'medium' }])
    await svc.prepare('a1', true)
    expect(svc.remind('a1', 'split this pdf into pages')).not.toContain('library_skip')
    svc.playbooks.write({ workspace: 'shop' }, [{ id: 'pdf', mode: 'on-demand', when: 'working with PDFs', strength: 'hard' }])
    await svc.prepare('a2', false)
    expect(svc.remind('a2', 'rename the lamp post')).toBe('Reminder: terse (always); pdf (working with PDFs).')
  })
  it('is always there for a hard rule, and says what it costs', async () => {
    await svc.prepare('a1', true)
    expect(svc.remind('a1', 'rename the lamp post')).toContain('library_skip')
    const c = svc.compileFor('/work/shop', true)
    expect(c.forcedCheckTokens).toBeGreaterThan(20)
    expect(c.forcedCheckTokens).toBeLessThan(120)
  })
})

describe('an agent passing over an item', () => {
  it('is logged with its reason, and refused for an item outside its playbook or with no reason', async () => {
    await svc.prepare('a1', true)
    svc.skip('a1', 'pdf', 'the question is only about PDFs')
    expect(svc.usesOf('a1').find((u) => u.how === 'skipped')).toMatchObject({ id: 'pdf', reason: 'the question is only about PDFs' })
    expect(svc.stats().items.pdf).toMatchObject({ declined: 1, reasons: ['the question is only about PDFs'] })
    expect(pushed).toContain('a1:skipped')
    expect(() => svc.skip('a1', 'secret', 'x')).toThrow('not in this workspace')
    expect(() => svc.skip('a1', 'pdf', '   ')).toThrow('reason')
    expect(svc.skip('a1', 'pdf', 'x'.repeat(500))).toBeUndefined()
    expect(svc.usesOf('a1').at(-1)!.reason).toHaveLength(200)
  })
})

describe('the cost of the check before acting', () => {
  it('is near the measured text', async () => {
    svc.playbooks.write({ workspace: 'shop' }, [{ id: 'pdf', mode: 'on-demand', when: 'ui work', strength: 'hard' }])
    expect(Math.abs(svc.compileFor('/work/shop', true).forcedCheckTokens - FORCED_CHECK_TOKENS)).toBeLessThanOrEqual(12)
  })
})

describe('skills a task\'s workflow names on its steps', () => {
  beforeEach(async () => {
    const s = join(dir, 'src', 'review')
    mkdirSync(s, { recursive: true })
    writeFileSync(join(s, 'SKILL.md'), '---\nname: review\ndescription: Review a diff against our standards.\n---\nRead the diff first.')
    await svc.library.addSkillFolder(s, 't')
  })

  it('can be read by the agent whose task names them even when the playbook leaves them out, and not by anyone else', async () => {
    await expect(svc.get('a1', 'review')).rejects.toThrow('not in this workspace')
    granted.a1 = ['review']
    expect(await svc.get('a1', 'review')).toContain('Read the diff first.')
    await expect(svc.get('a3', 'review')).rejects.toThrow('not in this workspace')
  })

  it('show in the agent\'s index as a step\'s, so it can find them', async () => {
    granted.a1 = ['review']
    const idx = await svc.index('a1')
    expect(idx.find((e) => e.id === 'review')).toMatchObject({ kind: 'skill', mode: 'step', description: 'Review a diff against our standards.', when: 'for the step of your workflow that names it' })
    expect(idx.map((e) => e.id)).toEqual(['terse', 'pdf', 'review'])
  })

  it('end with the task, and never open an item that is not a skill or does not exist', async () => {
    granted.a1 = ['review', 'secret', 'nope']
    await expect(svc.get('a1', 'secret')).rejects.toThrow('not in this workspace')
    expect((await svc.index('a1')).map((e) => e.id)).toEqual(['terse', 'pdf', 'review'])
    granted.a1 = []
    await expect(svc.get('a1', 'review')).rejects.toThrow('not in this workspace')
  })

  it('leave an item the playbook already has as it is, once', async () => {
    granted.a1 = ['pdf']
    const idx = await svc.index('a1')
    expect(idx.filter((e) => e.id === 'pdf')).toEqual([expect.objectContaining({ mode: 'on-demand', when: 'working with PDFs' })])
  })

  it('are counted as fetched like any other item', async () => {
    granted.a1 = ['review']
    await svc.get('a1', 'review')
    expect(pushed).toContain('a1:fetched')
    expect(pushedItems).toContain('review')
  })
})
