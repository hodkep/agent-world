import { describe, expect, it } from 'vitest'
import { PROGRAMS_FRESH_MS, programKeep } from './programKeep'
import { LIMITS_FRESH_MS } from './limitsProbe'

const counter = () => {
  const runs: string[] = []
  return { runs, run: async (file: string, args: string[]) => (runs.push(`${file} ${args.join(' ')}`), 'out') }
}

describe('programKeep', () => {
  it('one rule: readiness and limits are kept as long as each other', () => {
    expect(PROGRAMS_FRESH_MS).toBe(15 * 60_000)
    expect(LIMITS_FRESH_MS).toBe(PROGRAMS_FRESH_MS)
  })

  it('starts a program once for a command asked twice (agy detect and agy limits both ask -p /usage)', async () => {
    let t = 0
    const keep = programKeep(() => t)
    const { run, runs } = counter()
    const ask = keep.ask(run)
    await ask('agy', ['-p', '/usage'])
    t += 60_000
    await ask('agy', ['-p', '/usage'])
    expect(runs).toEqual(['agy -p /usage'])
  })

  it('asks again once the keep has run out', async () => {
    let t = 0
    const keep = programKeep(() => t)
    const { run, runs } = counter()
    const ask = keep.ask(run)
    await ask('agy', ['-p', '/usage'])
    t += PROGRAMS_FRESH_MS
    await ask('agy', ['-p', '/usage'])
    expect(runs).toHaveLength(2)
  })

  it('keeps another command, or another login of the same program, apart', async () => {
    const keep = programKeep(() => 0)
    const { run, runs } = counter()
    await keep.ask(run)('claude', ['--version'])
    await keep.ask(run)('claude', ['-p', '/usage'])
    await keep.ask(run, 'login-a')('claude', ['-p', '/usage'])
    await keep.ask(run, 'login-b')('claude', ['-p', '/usage'])
    expect(runs).toHaveLength(4)
  })

  it('refresh forgets what was kept: the next ask and the next detection run again', async () => {
    const keep = programKeep(() => 0)
    const { run, runs } = counter()
    let looked = 0
    const look = async () => (looked++, { state: 'ready' as const })
    await keep.ask(run)('agy', ['-p', '/usage'])
    await keep.detect('agy', look)
    await keep.detect('agy', look)
    expect(looked).toBe(1)
    keep.refresh()
    await keep.ask(run)('agy', ['-p', '/usage'])
    await keep.detect('agy', look)
    expect(runs).toHaveLength(2)
    expect(looked).toBe(2)
  })

  it('keeps a detection per program', async () => {
    const keep = programKeep(() => 0)
    let looked = 0
    const look = async () => (looked++, { state: 'ready' as const })
    await keep.detect('claude', look)
    await keep.detect('agy', look)
    expect(looked).toBe(2)
  })
})
