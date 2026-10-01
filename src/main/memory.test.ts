import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { forget, loadMemory, recall, remember } from './memory'

const file = () => join(mkdtempSync(join(tmpdir(), 'aw-mem-')), 'shop.json')

describe('project memory', () => {
  it('keeps what was remembered and who said it', () => {
    const f = file()
    remember(f, 'Tests run with pnpm test', 'ada', 1)
    expect(loadMemory(f)).toMatchObject([{ text: 'Tests run with pnpm test', by: 'ada', at: 1 }])
  })
  it('keeps the same note once, and refuses an empty one', () => {
    const f = file()
    remember(f, 'use tabs', 'ada')
    remember(f, ' use tabs ', 'linus')
    expect(loadMemory(f)).toHaveLength(1)
    expect(() => remember(f, '   ', 'ada')).toThrow(/empty/)
  })
  it('forgets a note by id', () => {
    const f = file()
    const e = remember(f, 'a', 'ada')
    remember(f, 'b', 'ada')
    forget(f, e.id)
    expect(loadMemory(f).map((x) => x.text)).toEqual(['b'])
  })
  it('drops the oldest notes past the limit', () => {
    const f = file()
    for (let i = 0; i < 205; i++) remember(f, `note ${i}`, 'ada', i)
    const all = loadMemory(f)
    expect(all).toHaveLength(200)
    expect(all[0]!.text).toBe('note 5')
  })
  it('recalls by matching words, best first, or the newest with no query', () => {
    const f = file()
    remember(f, 'Deploys go through the staging server first', 'ada', 1)
    remember(f, 'The staging server password lives in 1Password', 'ada', 2)
    remember(f, 'Use tabs for indentation', 'ada', 3)
    const all = loadMemory(f)
    expect(recall(all, 'staging server password').map((e) => e.at)).toEqual([2, 1])
    expect(recall(all, 'kubernetes')).toEqual([])
    expect(recall(all, '').map((e) => e.at)).toEqual([3, 2, 1])
  })
  it('survives a damaged file', () => {
    const f = file()
    require('node:fs').writeFileSync(f, '{oops')
    expect(loadMemory(f)).toEqual([])
  })
})
