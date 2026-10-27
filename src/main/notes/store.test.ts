import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createNoteStore } from './store'

const make = () => {
  let t = 1000
  return createNoteStore({ dir: mkdtempSync(join(tmpdir(), 'aw-notes-')), now: () => (t += 10) })
}

describe('the notes of a project', () => {
  it('keeps each note apart, with its own words, and lists the latest first by its title', () => {
    const s = make()
    const a = s.create('shop')
    const b = s.create('shop')
    s.write('shop', a, '# First note\n- [ ] one')
    s.write('shop', b, 'Second')
    expect(s.read('shop', a)).toBe('# First note\n- [ ] one')
    expect(s.list('shop').map((n) => n.title)).toEqual(['Second', 'First note'])
    s.write('shop', a, '# First note\n- [x] one')
    expect(s.list('shop').map((n) => n.id)).toEqual([a, b])
  })
  it('keeps the notes of one project out of another, and an empty one has a name', () => {
    const s = make()
    const a = s.create('shop')
    expect(s.list('other')).toEqual([])
    expect(s.list('shop')).toEqual([{ id: a, title: 'New note', updatedAt: expect.any(Number) }])
    expect(() => s.read('other', a)).toThrow(/No note/)
  })
  it('removes a note, and refuses a name that points outside the folder', () => {
    const s = make()
    const a = s.create('shop')
    s.remove('shop', a)
    expect(s.list('shop')).toEqual([])
    expect(() => s.read('shop', '../x')).toThrow(/No note/)
    expect(() => s.write('../shop', a, 'x')).toThrow(/No project/)
  })
})
