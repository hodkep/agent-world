import { describe, expect, it } from 'vitest'
import { even } from './tiling'
import { pruneViews, readMemory, saveMemory, setSlot, setView, slotOf, termTiles } from './gridMemory'

const none = { grid: null, layout: null }
const two = { root: even(['a1', 'a2']) }

describe('what each workspace remembers of its grid', () => {
  it('keeps the view of one workspace when another is switched, and shows a workspace as it was left', () => {
    let m = readMemory(null, none)
    m = setSlot(m, '/shop', { grid: false })
    m = setSlot(m, '/blog', { grid: true })
    expect(slotOf(m, '/shop').grid).toBe(false)
    expect(slotOf(m, '/blog').grid).toBe(true)
  })

  it('keeps the layout of one workspace when another one changes its own', () => {
    let m = setSlot(readMemory(null, none), '/shop', { layout: two })
    m = setSlot(m, '/blog', { layout: { root: even(['b1']) } })
    expect(slotOf(m, '/shop').layout).toEqual(two)
    expect(slotOf(m, '/blog').layout).toEqual({ root: even(['b1']) })
  })

  it('starts a workspace that was never seen from the old single setting, without its shells (they ended with the run that made them)', () => {
    const m = readMemory(null, { grid: '1', layout: JSON.stringify({ root: even(['a1', 'term:x']) }) })
    expect(slotOf(m, '/shop')).toEqual({ grid: true, layout: { root: even(['a1']) } })
    expect(slotOf(readMemory(null, none), '/shop')).toEqual({ grid: false, layout: null })
  })

  it('is what is read back after a restart, and ignores what is not a saved memory', () => {
    const m = setSlot(setSlot(readMemory(null, none), '/shop', { grid: true, layout: two }), '/blog', { grid: false })
    expect(readMemory(saveMemory(m), none)).toEqual(m)
    for (const bad of ['', 'x', '[]', '{"/shop":5}', '{"/shop":{"grid":true,"layout":{"root":{"kind":"leaf"}}}}']) expect(slotOf(readMemory(bad, none), '/shop')).toEqual({ grid: bad.includes('true'), layout: null })
  })

  it('lists the shells of every workspace, so one is closed only when no workspace has it', () => {
    const m = setSlot(setSlot(readMemory(null, none), '/shop', { layout: { root: even(['a1', 'term:1']) } }), '/blog', { layout: { root: even(['term:2']) } })
    expect(termTiles(m).sort()).toEqual(['term:1', 'term:2'])
  })
})

describe('which panes of a workspace show their terminal instead of the chat', () => {
  it('is kept with the workspace, apart from another one, and read back after a restart', () => {
    let m = setSlot(readMemory(null, none), '/shop', { grid: true, layout: two, views: { a1: 'terminal' } })
    m = setSlot(m, '/blog', { grid: true, layout: { root: even(['a1']) } })
    expect(slotOf(m, '/shop').views).toEqual({ a1: 'terminal' })
    expect(slotOf(m, '/blog').views).toBeUndefined()
    expect(readMemory(saveMemory(m), none)).toEqual(m)
  })

  it('reads only terminal choices, and a slot with none has no views at all', () => {
    const raw = JSON.stringify({ '/shop': { grid: true, layout: null, views: { a1: 'terminal', a2: 'chat', a3: 5, a4: null } }, '/blog': { grid: true, layout: null, views: 'terminal' } })
    expect(slotOf(readMemory(raw, none), '/shop').views).toEqual({ a1: 'terminal' })
    expect(slotOf(readMemory(raw, none), '/blog')).toEqual({ grid: true, layout: null })
  })

  it('turns one pane to its terminal and back, and leaves none behind when the last goes back', () => {
    const t = setView(undefined, 'a1', true)
    expect(t).toEqual({ a1: 'terminal' })
    expect(setView(t, 'a2', true)).toEqual({ a1: 'terminal', a2: 'terminal' })
    expect(setView(t, 'a1', false)).toBeUndefined()
    expect(t).toEqual({ a1: 'terminal' })
  })

  it('drops the choice of an agent that is no longer in the grid, so it comes back as a chat', () => {
    expect(pruneViews({ a1: 'terminal', gone: 'terminal' }, even(['a1', 'a2']))).toEqual({ a1: 'terminal' })
    expect(pruneViews({ gone: 'terminal' }, even(['a1']))).toBeUndefined()
    expect(pruneViews(undefined, even(['a1']))).toBeUndefined()
  })
})
