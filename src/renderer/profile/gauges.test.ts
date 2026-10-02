import { describe, expect, it } from 'vitest'
import { EFFORT_STEPS, contextGauge, costGauge, effortPips, linesGauge, toolBars } from './gauges'

describe('the gauges on the card', () => {
  it('shows context as how full it is, and goes from green through gold to red as it fills', () => {
    expect(contextGauge(42)).toEqual({ pct: 42, tone: 'ok' })
    expect(contextGauge(71).tone).toBe('warn')
    expect(contextGauge(88).tone).toBe('bad')
    expect(contextGauge(null)).toEqual({ pct: 0, tone: 'none' })
    expect(contextGauge(140).pct).toBe(100)
  })

  it('shows cost against the budget when there is one, and just the amount when there is not', () => {
    expect(costGauge(1.42, 5)).toEqual({ pct: 28, tone: 'ok', label: '$1.42 of $5' })
    expect(costGauge(4.6, 5).tone).toBe('warn')
    expect(costGauge(6, 5)).toMatchObject({ pct: 100, tone: 'bad' })
    expect(costGauge(1.42, undefined)).toEqual({ pct: null, tone: 'none', label: '$1.42' })
  })

  it('splits lines changed into what was added and what was removed', () => {
    expect(linesGauge(300, 100)).toEqual({ addPct: 75, delPct: 25, label: '+300 −100' })
    expect(linesGauge(0, 0)).toEqual({ addPct: 0, delPct: 0, label: '+0 −0' })
  })

  it('draws the top tools as bars, the busiest full length', () => {
    expect(toolBars([['Read', 40], ['Edit', 20], ['Bash', 10]])).toEqual([{ name: 'Read', count: 40, pct: 100 }, { name: 'Edit', count: 20, pct: 50 }, { name: 'Bash', count: 10, pct: 25 }])
    expect(toolBars([])).toEqual([])
  })

  it('shows thinking level as five steps, filled up to the one in use', () => {
    expect(EFFORT_STEPS).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
    expect(effortPips('high')).toEqual([true, true, true, false, false])
    expect(effortPips('')).toEqual([false, false, false, false, false])
    expect(effortPips('max')).toEqual([true, true, true, true, true])
  })
})
