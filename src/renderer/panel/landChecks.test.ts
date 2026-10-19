import { describe, expect, it } from 'vitest'
import { landChecks } from './landChecks'

const ok = { branch: 'aw/ada', base: 'main', ahead: 2, uncommitted: 0, baseReady: true, conflicts: [] as string[], unrelated: false }

describe('the lines of the Land checklist', () => {
  it('are ticks when there is something to land and nothing in the way', () => {
    const rows = landChecks(ok)
    expect(rows.every((r) => r.ok)).toBe(true)
    expect(rows.map((r) => r.text)).toEqual(['2 commits on aw/ada to land', 'Everything is committed', 'Your checkout is on main with nothing uncommitted', 'No conflicts with main'])
  })
  it('say what is in the way: nothing new, files not committed, a checkout elsewhere, conflicts', () => {
    const rows = landChecks({ ...ok, ahead: 0, uncommitted: 2, baseReady: false, conflicts: ['a.ts'] })
    expect(rows.map((r) => r.ok)).toEqual([false, false, false, false])
    expect(rows[0]!.text).toBe('Nothing to land: main already has everything on aw/ada')
    expect(rows[3]!.text).toBe('Would conflict in a.ts')
  })
  it('for a branch with no shared history is one red cross that says so (no count of commits, no "no conflicts"), then what else is in the way', () => {
    const rows = landChecks({ ...ok, ahead: 0, unrelated: true })
    expect(rows).toEqual([
      { ok: false, text: "This branch does not come from main's history: reset it onto main before landing" },
      { ok: true, text: 'Everything is committed' },
      { ok: true, text: 'Your checkout is on main with nothing uncommitted' }
    ])
  })
})
