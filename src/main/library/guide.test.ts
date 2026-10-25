import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Library } from './store'
import { Playbooks } from './playbook'
import { GUIDE_ID, syncGuide } from './guide'

const real = join(__dirname, '..', '..', '..', 'docs', 'guide')
const setup = (pages?: Record<string, string>) => {
  const root = mkdtempSync(join(tmpdir(), 'aw-guide-'))
  const dir = join(root, 'pages')
  mkdirSync(dir)
  for (const [f, t] of Object.entries(pages ?? {})) writeFileSync(join(dir, f), t)
  return { root: join(root, 'library'), dir }
}

describe('the guide as a library item', () => {
  it('is made from the guide pages themselves: one skill, a page per file, and a list of what each page answers', async () => {
    const { root } = setup()
    syncGuide({ root, guideDir: real })
    const item = (await new Library(root).get(GUIDE_ID))!
    expect(item.kind).toBe('skill')
    expect(item.source).toBe('built-in')
    const pages = readdirSync(real).filter((f) => f.endsWith('.md'))
    expect(item.files).toEqual(pages.sort())
    for (const f of pages) {
      expect(item.body).toContain(f)
      // Same words as the page on GitHub; only the pictures are left out, which an agent cannot see.
      const mine = readFileSync(join(root, 'skills', GUIDE_ID, f), 'utf8')
      expect(mine).toBe(readFileSync(join(real, f), 'utf8').replace(/^!\[[^\n]*\]\([^)\n]*\)\n+/gm, ''))
    }
    expect(item.body).toMatch(/do not answer from memory/i)
  })
  it('is rewritten when a page changes or goes, and left alone when nothing changed', () => {
    const { root, dir } = setup({ 'a.md': '# A\n\nDo **this**.\n', 'b.md': '# B\n\nOther.\n' })
    syncGuide({ root, guideDir: dir })
    const file = join(root, 'skills', GUIDE_ID, 'a.md')
    const before = readFileSync(file, 'utf8')
    syncGuide({ root, guideDir: dir })
    expect(readFileSync(file, 'utf8')).toBe(before)
    writeFileSync(join(dir, 'a.md'), '# A\n\nDo **that**.\n')
    rmSync(join(dir, 'b.md'))
    syncGuide({ root, guideDir: dir })
    expect(readFileSync(file, 'utf8')).toContain('that')
    expect(existsSync(join(root, 'skills', GUIDE_ID, 'b.md'))).toBe(false)
  })
  it('puts one rule in the Everywhere playbook once: asked how to do something in the app, read it first, and it stays out if the person took it out', () => {
    const { root } = setup()
    syncGuide({ root, guideDir: real })
    const playbooks = new Playbooks(root)
    const rules = playbooks.read('global').filter((r) => r.id === GUIDE_ID)
    expect(rules).toHaveLength(1)
    expect(rules[0]).toMatchObject({ mode: 'on-demand', strength: 'soft' })
    expect(rules[0]!.when).toMatch(/how to do something in Agent World/)
    playbooks.write('global', [])
    syncGuide({ root, guideDir: real })
    expect(playbooks.read('global')).toEqual([])
  })
  it('does nothing when the pages are not there', () => {
    const { root } = setup()
    syncGuide({ root, guideDir: join(root, 'nowhere') })
    expect(existsSync(join(root, 'skills', GUIDE_ID))).toBe(false)
  })
})
