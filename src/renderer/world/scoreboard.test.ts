import { describe, expect, it } from 'vitest'
import { scoreboardRows } from './scoreboard'

describe('the scoreboard on the lawn', () => {
  it('lists the agents that changed lines, most first, with a bar for each relative to the top', () => {
    const rows = scoreboardRows([{ name: 'tess', lines: 240 }, { name: 'ren', lines: 540 }, { name: 'ada', lines: 312 }, { name: 'linus', lines: 88 }])
    expect(rows.map((r) => [r.name, r.lines, r.pct])).toEqual([['REN', 540, 100], ['ADA', 312, 58], ['TESS', 240, 44], ['LINUS', 88, 16]])
  })

  it('leaves out agents with no changes, keeps the best four, and breaks a tie by name', () => {
    const rows = scoreboardRows([{ name: 'b', lines: 10 }, { name: 'a', lines: 10 }, { name: 'idle', lines: 0 }, { name: 'c', lines: 20 }, { name: 'd', lines: 5 }, { name: 'e', lines: 1 }])
    expect(rows.map((r) => r.name)).toEqual(['C', 'A', 'B', 'D'])
  })

  it('is empty when nobody has changed anything, so there is no sign to show', () => {
    expect(scoreboardRows([{ name: 'ada', lines: 0 }])).toEqual([])
    expect(scoreboardRows([])).toEqual([])
  })

  it('shortens a long name to fit the sign', () => {
    expect(scoreboardRows([{ name: 'bartholomew', lines: 3 }])[0]!.name).toBe('BARTHO')
  })
})
