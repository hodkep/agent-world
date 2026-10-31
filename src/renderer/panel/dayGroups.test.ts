import { describe, expect, it } from 'vitest'
import { groupByDay } from './dayGroups'

const at = (d: number, h = 12) => new Date(2026, 9, d, h).getTime()
const now = at(31, 15)

describe('grouping a newest-first list under day headings', () => {
  it('names today and yesterday, and dates the rest, keeping the order', () => {
    const items = [{ t: at(31, 14) }, { t: at(31, 9) }, { t: at(30, 20) }, { t: at(29, 8) }]
    const groups = groupByDay(items, (i) => i.t, now)
    expect(groups.map((g) => [g.label, g.items.length])).toEqual([['Today', 2], ['Yesterday', 1], ['Oct 29', 1]])
    expect(groups[0]!.items[0]).toBe(items[0])
  })

  it('gives nothing for nothing', () => {
    expect(groupByDay([], () => 0, now)).toEqual([])
  })

  it('starts a new heading when a day returns later in the list', () => {
    const groups = groupByDay([{ t: at(31) }, { t: at(30) }, { t: at(31, 8) }], (i) => i.t, now)
    expect(groups.map((g) => g.label)).toEqual(['Today', 'Yesterday', 'Today'])
  })
})
