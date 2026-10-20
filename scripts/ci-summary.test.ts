import { describe, expect, it } from 'vitest'
// @ts-expect-error a plain .mjs script, run by CI
import { summarize } from './ci-summary.mjs'

const test = (status: string, durations: number[]) => ({ status, results: durations.map((duration, retry) => ({ duration, retry, status: 'passed' })) })
const spec = (title: string, file: string, ...tests: ReturnType<typeof test>[]) => ({ title, file, tests })
const report = (...specs: ReturnType<typeof spec>[]) => ({ suites: [{ title: 'x.e2e.ts', file: 'x.e2e.ts', specs, suites: [{ title: 'inner', specs: [] }] }] })

describe('the end-to-end report as a step summary', () => {
  it('lists the specs that passed only on a retry', () => {
    const md = summarize([report(spec('steady', 'a.e2e.ts', test('expected', [1000])), spec('wobbly', 'b.e2e.ts', test('flaky', [900, 1100])))])
    expect(md).toContain('Flaky (1)')
    expect(md).toContain('b.e2e.ts › wobbly')
    expect(md).not.toMatch(/Flaky[\s\S]*a\.e2e\.ts › steady[\s\S]*Slowest/)
  })

  it('says there were none when nothing was flaky', () => {
    expect(summarize([report(spec('steady', 'a.e2e.ts', test('expected', [1000])))])).toContain('No flaky specs')
  })

  it('lists the ten slowest specs across every shard, slowest first, counting all attempts', () => {
    const many = Array.from({ length: 12 }, (_, i) => spec(`s${i}`, `f${i}.e2e.ts`, test('expected', [(i + 1) * 1000])))
    const md = summarize([report(...many.slice(0, 6)), report(...many.slice(6))])
    const rows = md.split('\n').filter((l) => /^\| \d+ \|/.test(l))
    expect(rows).toHaveLength(10)
    expect(rows[0]).toContain('f11.e2e.ts › s11')
    expect(rows[0]).toContain('12.0 s')
    expect(rows[9]).toContain('f2.e2e.ts › s2')
  })

  it('skips specs that did not run', () => {
    const md = summarize([report(spec('off', 'c.e2e.ts', test('skipped', [])))])
    expect(md).not.toContain('c.e2e.ts › off')
  })

  it('copes with no report at all', () => {
    expect(summarize([])).toContain('No end-to-end report')
  })
})
