import { describe, expect, it } from 'vitest'
import type { AgentProfile } from '../../shared/types'
import { type CardData, factRows } from './facts'

const now = 1_000_000_000_000
const profile: AgentProfile = { hiredAt: now - 3 * 86400_000 - 4 * 3600_000, hiredEstimated: false, workedMs: 72 * 60_000, turns: 21, tools: [['Read', 31], ['Edit', 14], ['Bash', 9]], files: 9, subagents: 12, commits: 3 }
const data: CardData = { id: 'a', name: 'ada', role: 'boss', roleLabel: 'Boss', activity: 'thinking', model: 'Sonnet 5.5', effort: 'medium', mode: 'Auto', branch: 'aw/ada', ctx: 42, costUsd: 1.42, budgetUsd: 5, add: 312, del: 48, profile, modelId: 'sonnet', effortId: 'medium', modeId: 'auto', canSwitch: true }
const by = (rows: ReturnType<typeof factRows>) => Object.fromEntries(rows.map((r) => [r.key, r.value]))

describe('the facts on the card, in words', () => {
  it('has every number from the live stats and the profile, worded the same way each time', () => {
    expect(by(factRows(data, now))).toEqual({
      model: 'Sonnet 5.5 · medium',
      mode: 'Auto',
      branch: 'aw/ada',
      hired: '3d 4h ago',
      worked: '1h 12m',
      context: '42% used',
      cost: '$1.42 of $5',
      lines: '+312 −48',
      files: '9 files · 21 turns',
      subagents: '12',
      commits: '3',
      tools: 'Read 31, Edit 14, Bash 9'
    })
  })

  it('says what it does not know instead of showing a wrong number', () => {
    const r = by(factRows({ ...data, ctx: null, budgetUsd: undefined, model: '', profile: null }, now))
    expect(r.context).toBe('not reported yet')
    expect(r.cost).toBe('$1.42')
    expect(r.model).toBe('not reported yet')
    expect(r.hired).toBe('loading…')
    const noBranch = by(factRows({ ...data, branch: '', profile: { ...profile, commits: null, hiredEstimated: true } }, now))
    expect(noBranch.branch).toBe('works in the folder itself')
    expect(noBranch.commits).toBe('none (no branch of its own)')
    expect(noBranch.hired).toBe('3d 4h ago (estimated)')
  })

  it('has shorter wordings for the card where a column is narrow, and none where the full text already fits', () => {
    const rows = factRows(data, now)
    expect(rows.find((r) => r.key === 'context')!.short).toBe('42%')
    expect(rows.find((r) => r.key === 'files')!.short).toBe('9 · 21')
    expect(rows.find((r) => r.key === 'hired')!.short).toBeUndefined()
  })

  it('marks which rows the small card leaves out', () => {
    const rows = factRows(data, now)
    expect(rows.filter((r) => !r.more).map((r) => r.key)).toEqual(['model', 'context', 'cost', 'lines'])
  })
})
