import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createChatMod } from './chatMod'

let dir: string
beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), 'aw-chatmod-'))))
afterEach(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }))

const hide = [{ match: { kind: ['thinking'] }, place: 'hidden' }]

describe('the look an agent writes', () => {
  it('starts as the system default: no look, no draft', () => {
    const m = createChatMod(dir)
    expect(m.state()).toEqual({ current: { layout: { rules: [] }, css: '', widgets: [] }, draft: null, draftBy: null, draftWhy: '', history: 0 })
  })

  it('a write is a draft: it shows, but is not what stays until the person keeps it', () => {
    const m = createChatMod(dir)
    const r = m.write({ layout: hide, css: '.msg { color: red }', by: 'ada', why: 'quieter' })
    expect(r.problems).toEqual([])
    expect(m.state().draft?.layout.rules).toHaveLength(1)
    expect(m.state().draftBy).toBe('ada')
    expect(m.state().current.css).toBe('')
    expect(createChatMod(dir).state().draft?.css).toBe('.msg { color: red }')
  })

  it('a write that names only one part keeps the other from what is in force', () => {
    const m = createChatMod(dir)
    m.write({ layout: hide, by: 'ada', why: 'a' })
    m.keep()
    m.write({ css: '.a { color: red }', by: 'bo', why: 'b' })
    expect(m.state().draft?.layout.rules).toHaveLength(1)
    expect(m.state().draft?.css).toBe('.a { color: red }')
  })

  it('keeps nothing of what it could not read, and says what was wrong', () => {
    const m = createChatMod(dir)
    const r = m.write({ css: '@import url(https://x.y/a.css);', by: 'ada', why: 'x' })
    expect(r.problems.length).toBeGreaterThan(0)
    expect(m.state().draft).toBeNull()
  })

  it('Keep makes the draft the look, and the one it replaced can be brought back', () => {
    const m = createChatMod(dir)
    m.write({ css: '.a { color: red }', by: 'ada', why: 'a' })
    m.keep()
    m.write({ css: '.a { color: blue }', by: 'ada', why: 'b' })
    m.keep()
    expect(m.state().current.css).toBe('.a { color: blue }')
    expect(m.state().draft).toBeNull()
    expect(m.state().history).toBe(2)
    m.back()
    expect(m.state().current.css).toBe('.a { color: red }')
    m.back()
    expect(m.state().current.css).toBe('')
    expect(m.state().history).toBe(0)
  })

  it('bringing a look back brings its layout rules too, not only its CSS', () => {
    const m = createChatMod(dir)
    m.write({ layout: hide, css: '.a { color: red }', by: 'ada', why: 'a' })
    m.keep()
    m.write({ layout: [], css: '', by: 'ada', why: 'b' })
    m.keep()
    expect(m.state().current.layout.rules).toHaveLength(0)
    m.back()
    expect(m.state().current.layout.rules).toHaveLength(1)
    expect(m.state().current.css).toBe('.a { color: red }')
  })

  it('nothing is half-applied: a write with anything unreadable in it is refused whole', () => {
    const m = createChatMod(dir)
    const r = m.write({ layout: [{ match: {}, place: 'sideways' }], css: '.a { color: red }', by: 'ada', why: 'x' })
    expect(r.problems.length).toBeGreaterThan(0)
    expect(m.state().draft).toBeNull()
  })

  it('widgets are written, kept, brought back and removed with the look, and one that cannot be read refuses the whole write', () => {
    const m = createChatMod(dir)
    const w = { id: 'spend', slot: 'above-composer', height: 32, html: '<b>x</b>', meters: ['cost'] }
    expect(m.write({ widgets: [w], by: 'ada', why: 'a' }).problems).toEqual([])
    m.keep()
    expect(createChatMod(dir).state().current.widgets).toEqual([w])
    m.write({ css: '.a { color: red }', by: 'ada', why: 'b' })
    expect(m.state().draft?.widgets).toEqual([w])
    m.keep()
    m.write({ widgets: [], by: 'ada', why: 'c' })
    m.keep()
    expect(m.state().current.widgets).toEqual([])
    m.back()
    expect(m.state().current.widgets).toEqual([w])
    expect(m.write({ widgets: [{ ...w, slot: 'nowhere' }], by: 'ada', why: 'd' }).problems.length).toBeGreaterThan(0)
    expect(m.state().draft).toBeNull()
  })

  it('Undo throws the draft away and leaves what was in force', () => {
    const m = createChatMod(dir)
    m.write({ css: '.a { color: red }', by: 'ada', why: 'a' })
    m.keep()
    m.write({ css: '.a { color: blue }', by: 'ada', why: 'b' })
    m.undo()
    expect(m.state().draft).toBeNull()
    expect(m.state().current.css).toBe('.a { color: red }')
  })

  it('restoring the system default removes the look at once and can itself be taken back', () => {
    const m = createChatMod(dir)
    m.write({ layout: hide, css: '.a { color: red }', by: 'ada', why: 'a' })
    m.keep()
    m.reset()
    expect(m.state().current).toEqual({ layout: { rules: [] }, css: '', widgets: [] })
    expect(m.state().draft).toBeNull()
    m.back()
    expect(m.state().current.css).toBe('.a { color: red }')
  })

  it('an agent asking for the default draws it as a draft too, so the person sees it', () => {
    const m = createChatMod(dir)
    m.write({ css: '.a { color: red }', by: 'ada', why: 'a' })
    m.keep()
    m.write({ reset: true, by: 'ada', why: 'back to normal' })
    expect(m.state().draft).toEqual({ layout: { rules: [] }, css: '', widgets: [] })
    expect(m.state().current.css).toBe('.a { color: red }')
  })

  it('a damaged file is the default, never a crash', () => {
    const m = createChatMod(dir)
    m.write({ css: '.a { color: red }', by: 'ada', why: 'a' })
    m.keep()
    writeFileSync(join(dir, 'current.json'), '{ not json')
    expect(createChatMod(dir).state().current).toEqual({ layout: { rules: [] }, css: '.a { color: red }', widgets: [] })
  })

  it('tells the window each time something changes, and keeps at most twenty earlier looks', () => {
    const m = createChatMod(dir)
    let seen = 0
    m.onChange(() => seen++)
    for (let i = 0; i < 25; i++) (m.write({ css: `.a { order: ${i} }`, by: 'ada', why: 'x' }), m.keep())
    expect(seen).toBe(50)
    expect(m.state().history).toBe(20)
    expect(readdirSync(join(dir, 'history')).length).toBeLessThanOrEqual(20)
    expect(existsSync(join(dir, 'current.css'))).toBe(true)
    expect(readFileSync(join(dir, 'current.css'), 'utf8')).toBe('.a { order: 24 }')
  })
})
