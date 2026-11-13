import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
    expect(m.state()).toEqual({ current: { layout: { rules: [] }, css: '', widgets: [] }, draft: null, draftBy: null, draftWhy: '', versions: [], draftData: false, recent: [] })
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
    expect(m.state().versions).toHaveLength(2)
    m.switchTo(1)
    expect(m.state().current.css).toBe('.a { color: red }')
    m.switchTo('system')
    expect(m.state().current.css).toBe('')
    expect(m.state().versions.map((v) => v.active)).toEqual([false, false])
  })

  it('bringing a look back brings its layout rules too, not only its CSS', () => {
    const m = createChatMod(dir)
    m.write({ layout: hide, css: '.a { color: red }', by: 'ada', why: 'a' })
    m.keep()
    m.write({ layout: [], css: '', by: 'ada', why: 'b' })
    m.keep()
    expect(m.state().current.layout.rules).toHaveLength(0)
    m.switchTo(1)
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
    const w = { id: 'spend', slot: 'above-composer', height: 32, html: '<b>x</b>', meters: ['cost'], fetch: [], series: [] }
    expect(m.write({ widgets: [w], by: 'ada', why: 'a' }).problems).toEqual([])
    m.keep()
    expect(createChatMod(dir).state().current.widgets).toEqual([w])
    m.write({ css: '.a { color: red }', by: 'ada', why: 'b' })
    expect(m.state().draft?.widgets).toEqual([w])
    m.keep()
    m.write({ widgets: [], by: 'ada', why: 'c' })
    m.keep()
    expect(m.state().current.widgets).toEqual([])
    m.switchTo(2)
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

    it('is refused after Keep, a restore, a switch, or another agent writing', () => {
      const acts: [string, (m: ReturnType<typeof createChatMod>) => void][] = [
        ['keep', (m) => m.keep()],
        ['restore', (m) => m.switchTo('system')],
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
    it('remembers each answer: Undo and Keep of a draft, restoring the system look, switching; newest first, eight at most, and after a restart', () => {
      const m = createChatMod(dir)
      m.write({ css: '.a { color: red }', by: 'ada', why: 'swap the sides' })
      m.undo()
      m.write({ css: '.b { color: red }', by: 'ada', why: 'move the button' })
      m.keep()
      m.switchTo('system')
      m.switchTo(1)
      expect(m.state().recent.map((r) => [r.outcome, r.by, r.why])).toEqual([['switched', 'ada', 'move the button'], ['restored the system look', 'the person', ''], ['kept', 'ada', 'move the button'], ['undone', 'ada', 'swap the sides']])
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
    m.switchTo('system')
    expect(m.state().current).toEqual({ layout: { rules: [] }, css: '', widgets: [] })
    expect(m.state().draft).toBeNull()
    m.switchTo(1)
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

  it('tells the window each time something changes, and keeps at most fifty versions', () => {
    const m = createChatMod(dir)
    let seen = 0
    m.onChange(() => seen++)
    for (let i = 0; i < 55; i++) (m.write({ css: `.a { order: ${i} }`, by: 'ada', why: 'x' }), m.keep())
    expect(seen).toBe(110)
    expect(m.state().versions).toHaveLength(50)
    expect(readdirSync(join(dir, 'history')).length).toBeLessThanOrEqual(50)
    expect(existsSync(join(dir, 'current.css'))).toBe(true)
    expect(readFileSync(join(dir, 'current.css'), 'utf8')).toBe('.a { order: 54 }')
  })

  describe('versions: every look that was kept, to switch back to at any time', () => {
    const keep = (m: ReturnType<typeof createChatMod>, css: string, by = 'ada', why = css) => (m.write({ css, by, why }), m.keep())
    const nums = (m: ReturnType<typeof createChatMod>) => m.state().versions.map((v) => [v.n, v.active])

    it('a Keep makes a numbered version with who wrote it, why and when; the newest is first and in force', () => {
      const m = createChatMod(dir)
      keep(m, '.a { color: red }', 'ada', 'red')
      keep(m, '.a { color: blue }', 'bo', 'blue')
      expect(nums(m)).toEqual([[2, true], [1, false]])
      const [v2, v1] = m.state().versions
      expect([v2!.by, v2!.why, v1!.by, v1!.why]).toEqual(['bo', 'blue', 'ada', 'red'])
      expect(v2!.at).toBeGreaterThan(0)
      expect(v1).toMatchObject({ cssBytes: '.a { color: red }'.length, rules: 0, widgets: 0 })
    })

    it('switching puts that version in force and saves the one left, so the switch can be switched back', () => {
      const m = createChatMod(dir)
      keep(m, '.a { color: red }')
      keep(m, '.a { color: blue }')
      expect(m.switchTo(1)).toBe(true)
      expect(m.state().current.css).toBe('.a { color: red }')
      expect(nums(m)).toEqual([[2, false], [1, true]])
      expect(m.switchTo(2)).toBe(true)
      expect(m.state().current.css).toBe('.a { color: blue }')
      expect(nums(m)).toEqual([[2, true], [1, false]])
      expect(nums(createChatMod(dir))).toEqual([[2, true], [1, false]])
    })

    it('switching to the system look saves the look that was in force; a draft waiting is dropped', () => {
      const m = createChatMod(dir)
      keep(m, '.a { color: red }')
      m.write({ css: '.b { order: 1 }', by: 'ada', why: 'draft' })
      expect(m.switchTo('system')).toBe(true)
      expect(m.state().draft).toBeNull()
      expect(m.state().current.css).toBe('')
      expect(nums(m)).toEqual([[1, false]])
      expect(m.switchTo(1)).toBe(true)
      expect(m.state().current.css).toBe('.a { color: red }')
    })

    it('a number that is not a version changes nothing', () => {
      const m = createChatMod(dir)
      keep(m, '.a { color: red }')
      let seen = 0
      m.onChange(() => seen++)
      expect(m.switchTo(9)).toBe(false)
      expect(m.rename(9, 'x')).toBe(false)
      expect(m.remove(9)).toBe(false)
      expect(seen).toBe(0)
      expect(m.state().current.css).toBe('.a { color: red }')
    })

    it('a version keeps its number through switches and restarts, and a new Keep takes the next', () => {
      const m = createChatMod(dir)
      keep(m, '.a { order: 1 }')
      keep(m, '.a { order: 2 }')
      m.switchTo(1)
      const again = createChatMod(dir)
      expect(nums(again)).toEqual([[2, false], [1, true]])
      keep(again, '.a { order: 3 }')
      expect(nums(again)).toEqual([[3, true], [2, false], [1, false]])
    })

    it('can be named, and a name stays after a switch and a restart', () => {
      const m = createChatMod(dir)
      keep(m, '.a { color: red }')
      keep(m, '.a { color: blue }')
      expect(m.rename(1, '  Warm paper ')).toBe(true)
      expect(m.rename(2, 'Night')).toBe(true)
      m.switchTo(1)
      expect(createChatMod(dir).state().versions.map((v) => [v.n, v.name])).toEqual([[2, 'Night'], [1, 'Warm paper']])
      expect(m.rename(1, '')).toBe(true)
      expect(m.state().versions.find((v) => v.n === 1)?.name).toBe('')
    })

    it('deletes one that is not in force, and refuses the one that is', () => {
      const m = createChatMod(dir)
      keep(m, '.a { color: red }')
      keep(m, '.a { color: blue }')
      expect(m.remove(2)).toBe(false)
      expect(m.remove(1)).toBe(true)
      expect(nums(m)).toEqual([[2, true]])
      expect(readdirSync(join(dir, 'history'))).toHaveLength(0)
    })

    it('over fifty, the oldest unnamed one goes first and a named one stays', () => {
      const m = createChatMod(dir)
      keep(m, '.a { order: 0 }')
      m.rename(1, 'Keep me')
      for (let i = 1; i < 60; i++) keep(m, `.a { order: ${i} }`)
      const ns = m.state().versions.map((v) => v.n)
      expect(ns).toHaveLength(50)
      expect(ns).toContain(1)
      expect(ns).not.toContain(2)
      expect(ns[0]).toBe(60)
    })

    it('reads looks kept before versions existed, with no author and numbers from their order', () => {
      mkdirSync(join(dir, 'history'), { recursive: true })
      writeFileSync(join(dir, 'history', '000001.json'), JSON.stringify({ layout: { rules: [] }, css: '.old { order: 1 }', widgets: [] }))
      writeFileSync(join(dir, 'history', '000002.json'), JSON.stringify({ layout: { rules: [] }, css: '.old { order: 2 }', widgets: [] }))
      writeFileSync(join(dir, 'current.json'), JSON.stringify({ layout: { rules: [] }, widgets: [] }))
      writeFileSync(join(dir, 'current.css'), '.now { order: 3 }')
      const m = createChatMod(dir)
      expect(nums(m)).toEqual([[3, true], [2, false], [1, false]])
      expect(m.state().versions.map((v) => v.by)).toEqual(['', '', ''])
      expect(m.switchTo(1)).toBe(true)
      expect(m.state().current.css).toBe('.old { order: 1 }')
      expect(nums(m)).toEqual([[3, false], [2, false], [1, true]])
    })

    it('each version carries the colours of its picture, from its own CSS', () => {
      const m = createChatMod(dir)
      keep(m, ':root { --accent: #e07aa8 }')
      expect(m.state().versions[0]!.swatch.accent).toBe('#e07aa8')
      expect(m.state().versions[0]!.swatch.bg).toBe('#12101a')
    })

    it('tells the agent the person switched, so it does not write back what they left', () => {
      const m = createChatMod(dir)
      keep(m, '.a { color: red }', 'ada', 'red')
      keep(m, '.a { color: blue }', 'bo', 'blue')
      m.read('a1')
      m.switchTo(1)
      expect(m.state().recent[0]).toMatchObject({ outcome: 'switched', by: 'ada', why: 'red' })
      expect(m.write({ css: '.z { order: 1 }', by: 'bo', who: 'a1', why: 'x' }).problems[0]).toMatch(/switched to version 1/)
    })
  })
})
