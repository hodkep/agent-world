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
    expect(m.state()).toEqual({ current: { layout: { rules: [] }, css: '', widgets: [] }, draft: null, draftBy: null, draftWhy: '', history: 0, draftData: false, recent: [] })
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
    const w = { id: 'spend', slot: 'above-composer', height: 32, html: '<b>x</b>', meters: ['cost'], fetch: [] }
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

  describe('an agent writing from a picture that is out of date', () => {
    const stale = /changed since you last read it.*chat_mod_get/s
    const hi = (m: ReturnType<typeof createChatMod>, who = 'a1') => m.write({ css: '.a { color: red }', by: 'ada', who, why: 'x' })

    it('must have read the look first', () => {
      const m = createChatMod(dir)
      expect(hi(m).problems[0]).toMatch(stale)
      expect(m.state().draft).toBeNull()
      m.read('a1')
      expect(hi(m).problems).toEqual([])
    })

    it('can write again after its own write, without reading', () => {
      const m = createChatMod(dir)
      m.read('a1')
      expect(hi(m).problems).toEqual([])
      expect(m.write({ css: '.a { color: blue }', by: 'ada', who: 'a1', why: 'y' }).problems).toEqual([])
    })

    it('is refused after the person undid its draft: what was undone is not in force, and the agent must look again', () => {
      const m = createChatMod(dir)
      m.read('a1')
      m.write({ widgets: [{ id: 'old', slot: 'chat-top', html: 'x' }], by: 'ada', who: 'a1', why: 'a' })
      m.undo()
      const r = m.write({ widgets: [{ id: 'new', slot: 'chat-top', html: 'y' }], by: 'ada', who: 'a1', why: 'b' })
      expect(r.problems[0]).toMatch(stale)
      expect(m.state().draft).toBeNull()
      m.read('a1')
      expect(m.write({ widgets: [{ id: 'new', slot: 'chat-top', html: 'y' }], by: 'ada', who: 'a1', why: 'b' }).problems).toEqual([])
      expect(m.state().draft?.widgets.map((w) => w.id)).toEqual(['new'])
    })

    it('is refused after Keep, a restore, going back, or another agent writing', () => {
      const acts: [string, (m: ReturnType<typeof createChatMod>) => void][] = [
        ['keep', (m) => m.keep()],
        ['reset', (m) => m.reset()],
        ['back', (m) => m.back()],
        ['another agent', (m) => (m.read('a2'), hi(m, 'a2'))]
      ]
      for (const [name, act] of acts) {
        const m = createChatMod(join(dir, name.replace(' ', '-')))
        m.read('a1')
        m.read('a2')
        m.write({ css: '.seed { order: 1 }', by: 'ada', who: 'a1', why: 'seed' })
        m.keep()
        m.read('a1')
        m.read('a2')
        m.write({ css: '.z { order: 2 }', by: 'ada', who: 'a1', why: 'draft' })
        act(m)
        expect(hi(m).problems[0], name).toMatch(stale)
      }
    })
  })

  it('a draft loads nothing from the internet until the person says so, and a new draft, Keep or Undo starts again', () => {
    const m = createChatMod(dir)
    m.loadData()
    expect(m.state().draftData).toBe(false) // no draft: nothing to load for
    m.write({ widgets: [{ id: 'q', slot: 'window-bottom', html: 'x', fetch: [{ id: 'a', url: 'https://a.example.com/q' }] }], by: 'ada', why: 'a' })
    expect(m.state().draftData).toBe(false)
    m.loadData()
    expect(m.state().draftData).toBe(true)
    m.write({ css: '.a { color: red }', by: 'ada', why: 'b' })
    expect(m.state().draftData).toBe(false)
    m.loadData()
    m.undo()
    expect(m.state().draftData).toBe(false)
    m.write({ css: '.a { color: red }', by: 'ada', why: 'c' })
    m.loadData()
    m.keep()
    expect(m.state().draftData).toBe(false)
  })

  describe('telling the agent what the person did', () => {
    it('remembers each answer: Undo and Keep of a draft, restoring the system look, going back; newest first, eight at most, and after a restart', () => {
      const m = createChatMod(dir)
      m.write({ css: '.a { color: red }', by: 'ada', why: 'swap the sides' })
      m.undo()
      m.write({ css: '.b { color: red }', by: 'ada', why: 'move the button' })
      m.keep()
      m.reset()
      m.back()
      expect(m.state().recent.map((r) => [r.outcome, r.by, r.why])).toEqual([['went back', 'the person', ''], ['restored the system look', 'the person', ''], ['kept', 'ada', 'move the button'], ['undone', 'ada', 'swap the sides']])
      expect(createChatMod(dir).state().recent).toHaveLength(4)
      for (let i = 0; i < 12; i++) (m.write({ css: `.c${i} { order: ${i} }`, by: 'ada', why: `w${i}` }), m.undo())
      expect(m.state().recent).toHaveLength(8)
      expect(m.state().recent[0]!.why).toBe('w11')
    })

    it('says in the refusal what the person did, so an agent that had not been told knows the draft was rejected', () => {
      const m = createChatMod(dir)
      m.read('a1')
      m.write({ css: '.a { color: red }', by: 'ada', who: 'a1', why: 'swap the sides' })
      m.undo()
      const r = m.write({ css: '.b { color: red }', by: 'ada', who: 'a1', why: 'x' })
      expect(r.problems[0]).toMatch(/pressed Undo.*"swap the sides".*did not want/s)
    })
  })

  describe('adding without carrying everything', () => {
    const w = (id: string) => ({ id, slot: 'chat-top', html: id })
    const start = () => {
      const m = createChatMod(join(dir, Math.random().toString(36).slice(2)))
      m.write({ css: '.one { order: 1 }', widgets: [w('a'), w('b')], layout: [{ match: { kind: ['thinking'] }, place: 'hidden' }], by: 'ada', why: 'start' })
      m.keep()
      return m
    }
    it('addCss goes after the css in force, and the rest stays', () => {
      const m = start()
      m.write({ addCss: '.two { order: 2 }', by: 'ada', why: 'x' })
      expect(m.state().draft!.css).toBe('.one { order: 1 }\n.two { order: 2 }')
      expect(m.state().draft!.widgets.map((x) => x.id)).toEqual(['a', 'b'])
      expect(m.state().draft!.layout.rules).toHaveLength(1)
    })
    it('addWidgets puts new ones in and replaces one with the same id; removeWidgets takes some out', () => {
      const m = start()
      m.write({ addWidgets: [w('c'), { ...w('a'), html: 'changed' }], removeWidgets: ['b'], by: 'ada', why: 'x' })
      expect(m.state().draft!.widgets.map((x) => [x.id, x.html])).toEqual([['a', 'changed'], ['c', 'c']])
    })
    it('working on a draft adds to the draft, not to what was kept', () => {
      const m = start()
      m.write({ addCss: '.two { order: 2 }', by: 'ada', why: 'x' })
      m.write({ addCss: '.three { order: 3 }', by: 'ada', why: 'y' })
      expect(m.state().draft!.css).toBe('.one { order: 1 }\n.two { order: 2 }\n.three { order: 3 }')
    })
    it('after Undo an addition is made to what is in force, so what was undone does not come back', () => {
      const m = start()
      m.read('a1')
      m.write({ addCss: '.undone { order: 9 }', by: 'ada', who: 'a1', why: 'x' })
      m.undo()
      m.read('a1')
      m.write({ addCss: '.new { order: 3 }', by: 'ada', who: 'a1', why: 'y' })
      expect(m.state().draft!.css).toBe('.one { order: 1 }\n.new { order: 3 }')
    })
    it('asking for a whole list and an addition to it at once is refused', () => {
      const m = start()
      expect(m.write({ css: 'a{}', addCss: 'b{}', by: 'ada', why: 'x' }).problems[0]).toMatch(/not both/)
      expect(m.write({ widgets: [w('z')], addWidgets: [w('y')], by: 'ada', why: 'x' }).problems[0]).toMatch(/not both/)
      expect(m.write({ widgets: [w('z')], removeWidgets: ['a'], by: 'ada', why: 'x' }).problems[0]).toMatch(/not both/)
    })
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
