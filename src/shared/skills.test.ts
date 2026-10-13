import { describe, expect, it } from 'vitest'
import { goneSkills, namedSkills, skillList, skillStates } from './skills'
import type { Workflow } from './workflow'

const wf = (...skills: (string[] | undefined)[]): Workflow => ({ version: 1, id: 'x', name: 'X', steps: skills.map((s, i) => ({ id: `s${i}`, kind: 'work' as const, ...(s && { skills: s }) })) })
const lib = [
  { id: 'tdd', kind: 'skill', description: 'Write the failing test first, then the code.' },
  { id: 'code-review', kind: 'skill', description: 'Review a diff against our standards.' },
  { id: 'house-style', kind: 'instruction', description: 'How we write.' }
]

describe('which skills a workflow names', () => {
  it('lists each id once, in the order the steps name them, and ignores steps with none', () => {
    expect(namedSkills(wf(['tdd', 'code-review'], undefined, ['code-review', 'deploy-notes']))).toEqual(['tdd', 'code-review', 'deploy-notes'])
    expect(namedSkills(wf(undefined))).toEqual([])
  })
})

describe('the state of a skill a step names', () => {
  it('is ready in the library and the project\'s playbook, granted in the library only, and gone otherwise', () => {
    const s = skillStates(wf(['tdd', 'code-review', 'deploy-notes']), lib, new Set(['tdd']))
    expect(s).toEqual({ tdd: 'ready', 'code-review': 'granted', 'deploy-notes': 'gone' })
    expect(goneSkills(s)).toEqual(['deploy-notes'])
  })

  it('is gone for a library item that is not a skill, because a step cannot use an instruction as one', () => {
    expect(skillStates(wf(['house-style']), lib, new Set(['house-style']))).toEqual({ 'house-style': 'gone' })
  })

  it('says nothing for a workflow that names no skills', () => {
    expect(skillStates(wf(undefined), lib, new Set())).toEqual({})
  })
})

describe('the skills the builder may name', () => {
  it('lists skills only, ready ones first, with what each is, and leaves out instructions', () => {
    const { text, ids } = skillList(lib, new Set(['code-review']))
    expect(ids).toEqual(['code-review', 'tdd'])
    expect(text).toBe('- code-review: Review a diff against our standards.\n- tdd: Write the failing test first, then the code. (not in this project\'s playbook; a step that names it lets agents read it)')
    expect(text).not.toContain('house-style')
  })

  it('cuts long descriptions, and past the limit names the rest by id only', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ id: `s${i}`, kind: 'skill', description: 'd'.repeat(200) }))
    const { text, ids } = skillList(many, new Set(), 3)
    expect(ids).toHaveLength(5)
    expect(text.split('\n')[0]!.length).toBeLessThan(260)
    expect(text).toContain('and 2 more, by id: s3, s4')
  })

  it('says so when the library has no skill', () => {
    expect(skillList([{ id: 'house-style', kind: 'instruction', description: '' }], new Set()).text).toBe('The library has no skills.')
  })
})
