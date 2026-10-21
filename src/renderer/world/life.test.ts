import { describe, expect, it } from 'vitest'
import { Life } from './life'

const lcg = (seed = 5) => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296
const free = { game: false, water: 1, coffee: 1 }

describe('what idle agents do with their time', () => {
  it('does nothing for the first few seconds, and nothing when no agent is idle', () => {
    const l = new Life(lcg())
    expect(l.decide(1000, ['a'], free)).toBeNull()
    expect(l.decide(60_000, [], free)).toBeNull()
  })

  it('sends one idle agent for a cup of water or coffee now and then, and a pair or four of them to the carrom board when there are enough', () => {
    const l = new Life(lcg(2))
    const seen = new Set<string>()
    let lone = 0
    for (let i = 0; i < 80; i++) {
      const plan = l.decide(20_000, ['a', 'b', 'c', 'd', 'e'], free)
      if (!plan) continue
      if (plan.kind === 'drink') seen.add(plan.what)
      else if (plan.kind === 'game') {
        expect([2, 4]).toContain(plan.agents.length)
        expect(new Set(plan.agents).size).toBe(plan.agents.length)
        seen.add('game')
      }
      lone++
    }
    expect(lone).toBeGreaterThan(20)
    expect([...seen].sort()).toEqual(['coffee', 'game', 'water'])
  })

  it('starts no game while one is on or with fewer than two idle agents, and a lone idle agent only drinks', () => {
    const l = new Life(lcg(4))
    for (let i = 0; i < 60; i++) {
      const on = l.decide(20_000, ['a', 'b', 'c'], { ...free, game: true })
      if (on) expect(on.kind).toBe('drink')
      const one = l.decide(20_000, ['a'], free)
      if (one) expect(one.kind).toBe('drink')
    }
  })

  it('does not fetch coffee when the pot is empty or water when the cooler is', () => {
    const l = new Life(lcg(6))
    for (let i = 0; i < 80; i++) {
      const plan = l.decide(20_000, ['a'], { game: true, water: 1, coffee: 0.05 })
      if (plan?.kind === 'drink') expect(plan.what).toBe('water')
      const dry = l.decide(20_000, ['a'], { game: true, water: 0.02, coffee: 1 })
      if (dry?.kind === 'drink') expect(dry.what).toBe('coffee')
    }
  })

  it('leaves a few seconds between one plan and the next', () => {
    const l = new Life(lcg(8))
    let first = null
    for (let i = 0; i < 50 && !first; i++) first = l.decide(2000, ['a', 'b'], free)
    expect(first).not.toBeNull()
    expect(l.decide(1000, ['a', 'b'], free)).toBeNull()
  })

  it('at lunch time idle agents go for their lunch, and at chai time for a cup of coffee', () => {
    const count = (ritual: 'lunch' | 'chai') => {
      const l = new Life(lcg(11))
      const kinds: string[] = []
      for (let i = 0; i < 60; i++) {
        const plan = l.decide(20_000, ['a', 'b', 'c'], { ...free, ritual })
        if (plan) kinds.push(plan.kind === 'drink' ? `drink:${plan.what}` : plan.kind)
      }
      return kinds
    }
    const lunch = count('lunch')
    expect(lunch.filter((k) => k === 'eat').length).toBeGreaterThan(lunch.length / 2)
    const chai = count('chai')
    expect(chai.filter((k) => k === 'drink:coffee').length).toBeGreaterThan(chai.length / 2)
  })

  it('two or three idle agents now and then huddle at the whiteboard, never while one is on or when only one is idle', () => {
    const l = new Life(lcg(13))
    const sizes = new Set<number>()
    for (let i = 0; i < 200; i++) {
      const plan = l.decide(20_000, ['a', 'b', 'c', 'd'], { ...free, huddle: false })
      if (plan?.kind === 'huddle') {
        sizes.add(plan.agents.length)
        expect(new Set(plan.agents).size).toBe(plan.agents.length)
      }
      const busy = l.decide(20_000, ['a', 'b', 'c', 'd'], { ...free, huddle: true })
      expect(busy?.kind).not.toBe('huddle')
      const lone = l.decide(20_000, ['a'], { ...free, huddle: false })
      expect(lone?.kind).not.toBe('huddle')
    }
    expect([...sizes].sort()).toEqual([2, 3])
  })
})
