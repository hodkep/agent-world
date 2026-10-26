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

  it('says what starting the app cost: how many launches, the median of each part and the share of the time of all the specs', () => {
    const launch = (spawn: number, window: number, close: number) => ({ type: 'launch', description: `spawn=${spawn} window=${window} close=${close}` })
    const withLaunches = (...l: ReturnType<typeof launch>[]) => ({ ...test('expected', [10_000]), annotations: l })
    const md = summarize([report(spec('a', 'a.e2e.ts', withLaunches(launch(200, 800, 50), launch(400, 1000, 70))), spec('b', 'b.e2e.ts', withLaunches(launch(300, 900, 60))))])
    expect(md).toContain('### App launches')
    expect(md).toContain('3 launches')
    // Median of 200, 300, 400 and of 800, 900, 1000 and of 50, 60, 70.
    expect(md).toMatch(/\| 300 ms \| 900 ms \| 60 ms \|/)
    // 2.1 + 2.0 + ... : (200+800+50) + (400+1000+70) + (300+900+60) = 3780 ms of 20 000 ms.
    expect(md).toContain('3.8 s of 20.0 s (19%)')
  })

  it('leaves the launch section out when the report has no launch notes', () => {
    expect(summarize([report(spec('a', 'a.e2e.ts', test('expected', [1000])))])).not.toContain('App launches')
  })
})
