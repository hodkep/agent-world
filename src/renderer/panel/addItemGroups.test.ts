import { describe, expect, it } from 'vitest'
import { groupItems, originOf } from './addItemGroups'

const item = (id: string, source: string, kind: 'skill' | 'instruction' | 'prompt' = 'skill', description = '') => ({ id, name: id, kind, source, description })

describe('originOf', () => {
  it('names well-known places and makes any other plugin readable', () => {
    expect(originOf('Claude plugin mattpocock-skills')).toMatchObject({ label: 'Matt Pocock skills', chip: 'Claude plugin' })
    expect(originOf('Claude plugin my-team-skills')).toMatchObject({ label: 'My team skills', chip: 'Claude plugin' })
    expect(originOf('~/.claude/skills')).toMatchObject({ label: 'Your Claude skills', chip: 'yours' })
    expect(originOf('~/.gemini/antigravity/skills')).toMatchObject({ label: 'Your Antigravity skills', chip: 'agy' })
    expect(originOf('new')).toMatchObject({ label: 'Instructions & prompts', chip: 'written here' })
  })
  it('keeps an unknown folder as it is', () => {
    expect(originOf('~/.gemini/skills').label).toBe('~/.gemini/skills')
  })
})

describe('groupItems', () => {
  const all = [
    item('mine', '~/.claude/skills'), item('tdd', 'Claude plugin mattpocock-skills', 'skill', 'Test-driven development'),
    item('docx', 'Claude plugin anthropic-skills', 'skill', 'Edit Word documents'), item('terse', 'new', 'instruction', 'Keep answers short'),
    item('zed', 'Claude plugin zed-skills'), item('abc', 'Claude plugin abc-skills')
  ]
  it('orders Anthropic first, other publishers A to Z, then yours, then instructions and prompts', () => {
    expect(groupItems(all, '').map((g) => g.label)).toEqual(['Anthropic skills', 'Abc skills', 'Matt Pocock skills', 'Zed skills', 'Your Claude skills', 'Instructions & prompts'])
  })
  it('finds by name, description or publisher, all words must match, and drops empty groups', () => {
    expect(groupItems(all, 'word').flatMap((g) => g.items.map((i) => i.id))).toEqual(['docx'])
    expect(groupItems(all, 'matt').map((g) => g.label)).toEqual(['Matt Pocock skills'])
    expect(groupItems(all, 'test banana').length).toBe(0)
    expect(groupItems(all, 'driven test')[0]?.items[0]?.id).toBe('tdd')
    expect(groupItems(all, 'zzz')).toEqual([])
  })
})
