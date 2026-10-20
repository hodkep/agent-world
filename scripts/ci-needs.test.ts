import { describe, expect, it } from 'vitest'
// @ts-expect-error a plain .mjs script, run by CI
import { allPassed } from './ci-needs.mjs'

describe('whether the jobs before the required check let it pass', () => {
  it('passes when every job succeeded or was left out on purpose', () => {
    expect(allPassed('success success success')).toBe(true)
    expect(allPassed('success success skipped')).toBe(true)
  })

  it('fails when a job failed, was cancelled, or was abandoned because no Mac was ever given to it', () => {
    expect(allPassed('success success failure')).toBe(false)
    expect(allPassed('success success cancelled')).toBe(false)
    expect(allPassed('success success abandoned')).toBe(false)
  })

  it('fails for a result nobody has met yet, and for none at all', () => {
    expect(allPassed('success something-new')).toBe(false)
    expect(allPassed('')).toBe(false)
  })
})
