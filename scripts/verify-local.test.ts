import { existsSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
// @ts-expect-error a plain .mjs script, run by a developer
import { CANARIES, planSpecs, report, tally } from './verify-local.mjs'

const SPECS = readdirSync('e2e').filter((f) => f.endsWith('.e2e.ts')).map((f) => `e2e/${f}`)

describe('which specs a change is checked by', () => {
  it('always includes the canaries, which are real spec files', () => {
    for (const c of CANARIES) expect(existsSync(`e2e/${c}.e2e.ts`), c).toBe(true)
    const { specs } = planSpecs(['docs/guide/the-office.md'], SPECS)
    expect(specs).toEqual(expect.arrayContaining(CANARIES.map((c: string) => `e2e/${c}.e2e.ts`)))
  })

  it('names the cross-cutting canaries the task asked for', () => {
    for (const c of ['agy', 'clone', 'controls', 'quit', 'preview-narrow', 'wrapup', 'messaging', 'library']) expect(CANARIES).toContain(c)
  })

  it('adds the specs of the area a source file is in, by the words of its path', () => {
    const { specs, reasons } = planSpecs(['src/renderer/panel/Accounts.tsx'], SPECS)
    expect(specs).toEqual(expect.arrayContaining(['e2e/accounts.e2e.ts', 'e2e/accounts-rename.e2e.ts', 'e2e/accounts-own-sign-in.e2e.ts']))
    expect(reasons.join('\n')).toContain('Accounts.tsx')
  })

  it('takes the words of a folder too, and a plural for its singular', () => {
    const { specs } = planSpecs(['src/main/library/service.ts'], SPECS)
    expect(specs).toEqual(expect.arrayContaining(['e2e/library-chat.e2e.ts', 'e2e/library-off.e2e.ts']))
    expect(planSpecs(['src/renderer/todos/Board.tsx'], SPECS).specs).toContain('e2e/todos.e2e.ts')
  })

  it('adds a spec file that was touched, whatever its name', () => {
    expect(planSpecs(['e2e/tab-jump.e2e.ts'], SPECS).specs).toContain('e2e/tab-jump.e2e.ts')
  })

  it('leaves a cross-cutting file to the canaries and says so, instead of matching every spec for its name', () => {
    const { specs, reasons } = planSpecs(['src/renderer/App.tsx', 'src/main/index.ts', 'src/renderer/styles.css'], SPECS)
    expect(specs).toHaveLength(CANARIES.length)
    expect(reasons.join('\n')).toMatch(/App\.tsx.*canaries/)
  })

  it('keeps a spec once and ignores a deleted spec file and files that are not specs', () => {
    const { specs } = planSpecs(['e2e/agy.e2e.ts', 'e2e/gone.e2e.ts', 'e2e/launch.ts', 'README.md'], SPECS)
    expect(specs.filter((s: string) => s === 'e2e/agy.e2e.ts')).toHaveLength(1)
    expect(specs).not.toContain('e2e/gone.e2e.ts')
    expect(new Set(specs).size).toBe(specs.length)
  })

  it('caps the specs of an area, never the touched specs or the canaries, and says how many were left out', () => {
    const many = [...SPECS, ...Array.from({ length: 40 }, (_, i) => `e2e/workflows-extra${i}.e2e.ts`)]
    const { specs, left } = planSpecs(['src/main/workflows/store.ts', 'e2e/tab-jump.e2e.ts'], many, { maxArea: 5 })
    expect(left).toBeGreaterThan(0)
    expect(specs).toContain('e2e/tab-jump.e2e.ts')
    expect(specs.filter((s: string) => /workflows/.test(s) && !CANARIES.some((c: string) => s === `e2e/${c}.e2e.ts`))).toHaveLength(5 + 0)
  })
})

describe('what a run says for itself', () => {
  const test = (status: string) => ({ status, results: [{ duration: 1000 }] })
  const rep = {
    suites: [
      { file: 'e2e/a.e2e.ts', specs: [{ title: 'one', file: 'e2e/a.e2e.ts', tests: [test('expected')] }, { title: 'two', file: 'e2e/a.e2e.ts', tests: [test('flaky')] }] },
      { file: 'e2e/b.e2e.ts', specs: [{ title: 'three', file: 'e2e/b.e2e.ts', tests: [test('unexpected')] }, { title: 'four', file: 'e2e/b.e2e.ts', tests: [test('skipped')] }] }
    ]
  }

  it('counts passed, flaky and failed per spec file, leaving out the skipped', () => {
    expect(tally([rep])).toEqual({
      files: { 'e2e/a.e2e.ts': { passed: 1, flaky: 1, failed: 0 }, 'e2e/b.e2e.ts': { passed: 0, flaky: 0, failed: 1 } },
      passed: 1,
      flaky: 1,
      failed: 1
    })
  })

  it('is a comment with the commit, the specs run, the counts and that it is local evidence', () => {
    const md = report({ sha: 'abc1234', base: 'origin/main', specs: ['e2e/a.e2e.ts', 'e2e/b.e2e.ts'], left: 0, tally: tally([rep]), minutes: 7.5, workers: 2 })
    expect(md).toContain('abc1234')
    expect(md).toContain('2 spec files')
    expect(md).toMatch(/1 passed.*1 flaky.*1 failed/)
    expect(md).toContain('e2e/b.e2e.ts')
    expect(md).toMatch(/not a CI run/i)
  })

  it('says what was left out by the cap', () => {
    expect(report({ sha: 'abc', base: 'main', specs: ['e2e/a.e2e.ts'], left: 7, tally: tally([]), minutes: 1, workers: 2 })).toContain('7 more')
  })
})
