import { describe, expect, it } from 'vitest'
import { Director, PHONE_LINES, SUPERVISOR_LINES, type Place, type Scene } from './staff'

/** A random source that returns the given numbers in turn, then repeats the last. */
const seq = (...xs: number[]) => {
  let i = 0
  return () => xs[Math.min(i++, xs.length - 1)]!
}
/** A random source that is repeatable but moves about, for tests that need many different draws. */
const lcg = (seed = 7) => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296
const at = (x: number, y: number, face: Place['face'] = 'up'): Place => ({ to: { x, y }, face })
const scene = (o: Partial<Scene> = {}): Scene => ({
  working: [],
  idle: 0,
  spots: {
    door: { x: 8, y: 16 },
    cooler: at(17, 3),
    bin: at(2, 14),
    counter: at(21, 15, 'right'),
    coffee: at(25, 14, 'down'),
    printer: at(16, 15),
    sink: at(23, 14, 'down'),
    outside: [at(8, 15, 'down'), at(9, 15, 'down')],
    corner: { x: 21, y: 12 },
    plants: [at(1, 3), at(19, 3)],
    shelves: [at(3, 2), at(15, 2)],
    paintings: [at(25, 2)],
    tables: [at(4, 11, 'right')],
    kanban: [at(9, 2)],
    phone: [at(20, 6, 'right')],
    sweep: [{ x: 5, y: 5 }, { x: 12, y: 5 }, { x: 5, y: 9 }]
  },
  boy: { x: 5, y: 5 },
  boyCarrying: false,
  meet: at(6, 5, 'left'),
  idleAgents: [],
  ...o
})
const thens = (steps: ReturnType<Director['boyPlan']>) => steps.flatMap((s) => (s.kind === 'wait' && s.then ? [s.then] : []))

describe('the water in the cooler and the coffee', () => {
  it('water falls with the idle agents who are around, faster with more of them, and never below nothing', () => {
    const d = new Director(seq(0.5))
    d.tick(60_000, 0)
    expect(d.water).toBe(1)
    d.tick(60_000, 1)
    const one = 1 - d.water
    expect(one).toBeGreaterThan(0)
    const e = new Director(seq(0.5))
    e.tick(60_000, 3)
    expect(1 - e.water).toBeCloseTo(one * 3, 5)
    e.tick(10_000_000, 3)
    expect(e.water).toBe(0)
  })

  it('every cup lowers what is in the cooler or the pot, and each is refilled to the top; the water runs low below a fifth, the coffee below a quarter', () => {
    const d = new Director(seq(0.5))
    d.sip('water')
    d.sip('coffee')
    expect(d.water).toBeCloseTo(0.96, 5)
    expect(d.coffee).toBeCloseTo(0.88, 5)
    for (let i = 0; i < 10; i++) (d.sip('coffee'), d.sip('water'))
    expect(d.coffeeLow).toBe(true)
    expect(d.coffee).toBeGreaterThanOrEqual(0)
    d.tick(10_000_000, 1)
    expect(d.low).toBe(true)
    d.refill()
    d.brew()
    expect(d.water).toBe(1)
    expect(d.coffee).toBe(1)
  })

  it('can fall faster while the staff keep their own pace', () => {
    const slow = new Director(seq(0.5))
    const watery = new Director(seq(0.5), 1, 8)
    slow.tick(1000, 2)
    watery.tick(1000, 2)
    expect(1 - watery.water).toBeCloseTo((1 - slow.water) * 8, 5)
  })
})

describe('what the supervisor can do, and does', () => {
  it('checks on an agent only when one is working, at most once in 150 s, and never the same agent twice within five minutes', () => {
    const d = new Director(seq(0.5))
    expect(d.supervisorOptions(scene())).not.toContain('visit')
    const working = [at(4, 6, 'left'), at(9, 6, 'left')]
    expect(d.supervisorOptions(scene({ working }))).toContain('visit')
    const first = d.supervisorPlan(scene({ working }), 'visit')
    expect(first.steps[0]).toMatchObject({ kind: 'walk' })
    expect(d.supervisorOptions(scene({ working }))).not.toContain('visit')
    d.tick(151_000, 0)
    expect(d.supervisorOptions(scene({ working }))).toContain('visit')
    const second = d.supervisorPlan(scene({ working }), 'visit')
    expect(second.steps[0]).not.toEqual(first.steps[0])
    d.tick(100_000, 0)
    expect(d.supervisorOptions(scene({ working }))).not.toContain('visit')
    // Five minutes after the first visit it is eligible again.
    d.tick(60_000, 0)
    expect(d.supervisorOptions(scene({ working }))).toContain('visit')
  })

  it('stands beside the agent for a few seconds and says one of his lines, facing it', () => {
    const d = new Director(seq(0))
    const plan = d.supervisorPlan(scene({ working: [at(4, 6, 'left')] }), 'visit')
    const wait = plan.steps[1]!
    expect(wait).toMatchObject({ kind: 'wait', face: 'left' })
    expect(SUPERVISOR_LINES).toContain((wait as { say: string }).say)
    expect((wait as { ms: number }).ms).toBeGreaterThanOrEqual(3000)
    expect((wait as { ms: number }).ms).toBeLessThanOrEqual(5000)
  })

  it('takes a book from the library shelf, turns to the front and reads it open in both hands for a good while, then reaches up and puts it back', () => {
    const plan = new Director(seq(0)).supervisorPlan(scene(), 'read')
    expect(plan.steps[0]).toEqual({ kind: 'walk', to: { x: 3, y: 2 } })
    expect(plan.steps[1]).toMatchObject({ kind: 'wait', face: 'up', pose: 'reach', then: 'takeBook' })
    expect(plan.steps[2]).toMatchObject({ kind: 'wait', face: 'down', pose: 'hold', prop: 'book' })
    expect((plan.steps[2] as { ms: number }).ms).toBeGreaterThanOrEqual(7000)
    expect(plan.steps[3]).toMatchObject({ kind: 'wait', face: 'up', pose: 'reach', then: 'putBook' })
  })

  it('stands in the doorway looking out, hands clasped behind his back, for several seconds', () => {
    const plan = new Director(seq(0)).supervisorPlan(scene(), 'outside')
    expect(plan.steps[0]).toEqual({ kind: 'walk', to: { x: 8, y: 15 } })
    expect(plan.steps[1]).toMatchObject({ kind: 'wait', face: 'down', pose: 'clasp' })
    expect((plan.steps[1] as { ms: number }).ms).toBeGreaterThanOrEqual(6000)
  })

  it('drinks a cup of coffee at the counter or of water at the cooler, which lowers it, and has none to drink when it is empty', () => {
    const d = new Director(seq(0))
    expect(d.supervisorPlan(scene(), 'coffee').steps[1]).toMatchObject({ pose: 'sip', prop: 'cup', then: 'sipCoffee', face: 'down' })
    expect(d.supervisorPlan(scene(), 'water').steps[1]).toMatchObject({ pose: 'sip', prop: 'cup', then: 'sipWater', face: 'up' })
    const dry = new Director(seq(0.5))
    for (let i = 0; i < 12; i++) (dry.sip('coffee'), dry.sip('water'))
    dry.tick(10_000_000, 1)
    expect(dry.supervisorOptions(scene())).not.toContain('coffee')
    expect(dry.supervisorOptions(scene())).not.toContain('water')
  })

  it('stands in front of a painting with a hand to his chin, takes a phone call, and looks at the kanban board', () => {
    const d = new Director(seq(0.5))
    expect(d.supervisorPlan(scene(), 'paint').steps[1]).toMatchObject({ pose: 'chin', face: 'up' })
    const call = d.supervisorPlan(scene(), 'call').steps[1]!
    expect(call).toMatchObject({ pose: 'call', prop: 'phone' })
    expect(PHONE_LINES).toContain((call as { say: string }).say)
    expect(d.supervisorPlan(scene(), 'look').steps[1]).toMatchObject({ pose: 'chin' })
  })

  it('goes to the office boy, points, says what to do, and orders the cooler when its water is low and the coffee when that is, else a chore', () => {
    const d = new Director(seq(0.5))
    const plan = d.supervisorPlan(scene(), 'order')
    expect(plan.meetsBoy).toBe(true)
    expect(plan.steps[0]).toEqual({ kind: 'walk', to: { x: 6, y: 5 } })
    expect(plan.steps[1]).toMatchObject({ kind: 'wait', face: 'left', pose: 'point', then: 'order' })
    expect(['bin', 'counter', 'plants', 'sweep']).toContain(d.order)
    const low = new Director(seq(0.5))
    low.tick(10_000_000, 1)
    expect((low.supervisorPlan(scene(), 'order').steps[1] as { say: string }).say).toBe('Refill the cooler!')
    expect(low.order).toBe('refill')
  })

  it('does not stop the office boy while he carries something, and not again within two minutes of the last order', () => {
    const d = new Director(seq(0.5))
    expect(d.supervisorOptions(scene({ boyCarrying: true }))).not.toContain('order')
    expect(d.supervisorOptions(scene())).toContain('order')
    d.supervisorPlan(scene(), 'order')
    expect(d.supervisorOptions(scene())).not.toContain('order')
    d.tick(121_000, 0)
    expect(d.supervisorOptions(scene())).toContain('order')
  })

  it('never has nothing to do and never does the same thing twice running, whatever the draws', () => {
    const d = new Director(lcg())
    let last = ''
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) {
      d.tick(20_000, 1)
      const plan = d.supervisorPlan(scene({ working: [at(4, 6, 'left'), at(9, 6, 'left'), at(14, 6, 'left')] }))
      expect(plan.steps.length).toBeGreaterThan(0)
      expect(plan.steps.some((s) => s.kind === 'walk')).toBe(true)
      expect(plan.kind).not.toBe(last)
      last = plan.kind
      seen.add(plan.kind)
      if (d.order) d.order = null
      d.coffee = Math.max(d.coffee, 0.6)
      d.refill()
    }
    expect(seen.size).toBeGreaterThanOrEqual(7)
  })

  it('walks to the lounge corner and waits a little when nothing else is possible', () => {
    const d = new Director(seq(0.5))
    const bare = scene()
    bare.spots = { ...bare.spots, shelves: [], paintings: [], phone: [], kanban: [], outside: [] }
    d.tick(10_000_000, 1)
    for (let i = 0; i < 12; i++) d.sip('coffee')
    const plan = d.supervisorPlan({ ...bare, boyCarrying: true })
    expect(plan.kind).toBe('rest')
    expect(plan.steps[0]).toEqual({ kind: 'walk', to: { x: 21, y: 12 } })
  })
})

describe('what the office boy does', () => {
  it('swaps the cooler jar when the water is low: the empty one out, filled at the tap of the kitchen sink, and the full one back in', () => {
    const d = new Director(seq(0.5))
    d.tick(10_000_000, 1)
    const steps = d.boyPlan(scene())
    expect(thens(steps)).toEqual(['swapOut', 'fill', 'takeJar', 'swapIn'])
    expect(steps.filter((s) => s.kind === 'walk').map((s) => (s as { to: unknown }).to)).toEqual([{ x: 17, y: 3 }, { x: 23, y: 14 }, { x: 17, y: 3 }, { x: 21, y: 15 }])
    expect(steps[3]).toMatchObject({ face: 'down', then: 'fill' })
    expect((steps[3] as { ms: number }).ms).toBeGreaterThanOrEqual(2000)
  })

  it('makes more coffee when the pot is low', () => {
    const d = new Director(seq(0.5))
    for (let i = 0; i < 12; i++) d.sip('coffee')
    expect(thens(d.boyPlan(scene()))).toEqual(['brew'])
  })

  it('salutes the supervisor first when he was ordered, for about a second, then does the job, and the order is used up', () => {
    const d = new Director(seq(0.5))
    d.order = 'bin'
    const steps = d.boyPlan(scene())
    expect(steps[0]).toMatchObject({ kind: 'wait', pose: 'salute' })
    expect((steps[0] as { ms: number }).ms).toBeGreaterThanOrEqual(900)
    expect(thens(steps)).toEqual(['bag', 'drop'])
    expect(d.order).toBeNull()
  })

  it('takes the rubbish out, wipes the counter and the tables with a cloth, sweeps with a broom between two places, waters a plant, and tidies the printer', () => {
    const d = new Director(seq(0.5))
    d.order = 'counter'
    expect(d.boyPlan(scene()).at(-3)).toMatchObject({ pose: 'wipe', prop: 'cloth', face: 'right' })
    d.order = 'plants'
    expect(d.boyPlan(scene()).at(-3)).toMatchObject({ pose: 'hold', prop: 'can' })
    d.order = 'sweep'
    const sweep = d.boyPlan(scene()).filter((s) => s.kind === 'wait' && s.prop === 'broom')
    expect(sweep).toHaveLength(2)
    expect((sweep[0] as { face: string }).face).not.toBe((sweep[1] as { face: string }).face)
  })

  it('carries a tray of coffee from the counter to an idle agent, only when there is one', () => {
    const d = new Director(lcg(11))
    const idle = [at(24, 6, 'left')]
    let tray = false
    for (let i = 0; i < 60 && !tray; i++) {
      const steps = d.boyPlan(scene({ idleAgents: idle }))
      if (thens(steps).join() === 'tray,drop') tray = true
    }
    expect(tray).toBe(true)
    for (let i = 0; i < 60; i++) expect(thens(d.boyPlan(scene())).join()).not.toBe('tray,drop')
  })

  it('is never left with nothing to do, and never does the same job twice running, whatever the draws', () => {
    const d = new Director(lcg(3))
    const jobs = new Set<string>()
    let last = ''
    for (let i = 0; i < 200; i++) {
      const steps = d.boyPlan(scene({ idleAgents: [at(24, 6, 'left')] }))
      expect(steps.length).toBeGreaterThan(0)
      expect(steps.some((s) => s.kind === 'walk')).toBe(true)
      const sig = JSON.stringify(steps.filter((s) => s.kind === 'walk').map((s) => (s as { to: unknown }).to))
      expect(sig).not.toBe(last)
      last = sig
      jobs.add(sig)
    }
    expect(jobs.size).toBeGreaterThanOrEqual(6)
  })

  it('at night the office boy only cleans: he sweeps, wipes and empties the bin, and brings nothing to anyone', () => {
    const d = new Director(lcg(5))
    let brooms = 0
    for (let i = 0; i < 80; i++) {
      const steps = d.boyPlan(scene({ ritual: 'night', idleAgents: [at(24, 6, 'left')] }))
      const t = thens(steps)
      expect(t).not.toContain('tray')
      expect(t).not.toContain('parcel')
      if (steps.some((s) => s.kind === 'wait' && s.prop === 'broom')) brooms++
    }
    expect(brooms).toBeGreaterThan(80 / 3)
  })

  it('at chai time he carries a tray of cups to an idle agent each time he is free, unless the cooler or the pot is low', () => {
    const d = new Director(lcg(6))
    for (let i = 0; i < 20; i++) expect(thens(d.boyPlan(scene({ ritual: 'chai', idleAgents: [at(24, 6, 'left')] }))).join()).toBe('tray,drop')
    d.water = 0.05
    expect(thens(d.boyPlan(scene({ ritual: 'chai', idleAgents: [at(24, 6, 'left')] })))).toContain('fill')
  })

  it('the office boy rests by the counter for 45 to 90 seconds after every job, and a job itself takes a good while', () => {
    const d = new Director(lcg(31))
    for (let i = 0; i < 60; i++) {
      const steps = d.boyPlan(scene({ idleAgents: [at(24, 6, 'left')] }))
      const rest = steps[steps.length - 1]!
      expect(rest).toMatchObject({ kind: 'wait', face: 'right' })
      expect((rest as { ms: number }).ms).toBeGreaterThanOrEqual(45_000)
      expect((rest as { ms: number }).ms).toBeLessThanOrEqual(90_000)
      expect(steps[steps.length - 2]).toEqual({ kind: 'walk', to: { x: 21, y: 15 } })
      const work = steps.slice(0, -2).filter((x) => x.kind === 'wait' && x.prop).map((x) => (x as { ms: number }).ms)
      for (const ms of work) expect(ms).toBeGreaterThanOrEqual(5000)
    }
  })

  it('the supervisor rests at the corner for 40 to 90 seconds after each round, but not after giving an order, which the boy answers', () => {
    const d = new Director(lcg(32))
    for (const kind of ['read', 'coffee', 'water', 'paint', 'call', 'look', 'outside'] as const) {
      const steps = d.supervisorPlan(scene(), kind).steps
      const rest = steps[steps.length - 1] as { kind: string; ms: number }
      expect(rest.kind).toBe('wait')
      expect(rest.ms).toBeGreaterThanOrEqual(40_000)
      expect(rest.ms).toBeLessThanOrEqual(90_000)
      expect(steps[steps.length - 2]).toEqual({ kind: 'walk', to: { x: 21, y: 12 } })
    }
    const order = d.supervisorPlan(scene(), 'order').steps
    expect((order[order.length - 1] as { ms: number }).ms).toBeLessThan(5000)
  })

  it('the supervisor checks on a working agent at most once in 150 seconds, and gives an order at most once in two minutes', () => {
    const d = new Director(lcg(33))
    const working = [at(5, 5, 'left'), at(9, 5, 'left')]
    d.supervisorPlan(scene({ working }), 'visit')
    d.supervisorPlan(scene(), 'order')
    d.tick(60_000, 0)
    expect(d.supervisorOptions(scene({ working }))).not.toContain('visit')
    expect(d.supervisorOptions(scene({ working }))).not.toContain('order')
    d.tick(100_000, 0)
    expect(d.supervisorOptions(scene({ working }))).toContain('visit')
    expect(d.supervisorOptions(scene({ working }))).toContain('order')
  })

  it('goes to catch the office boy only while he plays carrom: he walks to the place the world names, and it ends in no order', () => {
    const d = new Director(lcg(41))
    expect(d.supervisorOptions(scene())).not.toContain('catch')
    const sc = scene({ catchAt: { x: 20, y: 5 } })
    expect(d.supervisorOptions(sc)).toContain('catch')
    const plan = d.supervisorPlan(sc, 'catch')
    expect(plan).toMatchObject({ kind: 'catch', meetsBoy: false })
    expect(plan.steps[0]).toEqual({ kind: 'walk', to: { x: 20, y: 5 } })
    expect(plan.steps.filter((x) => x.kind === 'wait').length).toBeLessThanOrEqual(1)
  })

  it('cleans the room for as long as it is asked: sweeping and wiping, one after the other, with nothing handed out', () => {
    const d = new Director(lcg(42))
    const steps = d.cleaning(scene(), 90_000)
    const waited = steps.reduce((n, x) => n + (x.kind === 'wait' ? x.ms : 0), 0)
    expect(waited).toBeGreaterThanOrEqual(90_000)
    expect(waited).toBeLessThan(120_000)
    expect(steps.some((x) => x.kind === 'wait' && x.prop === 'broom')).toBe(true)
    for (const x of steps) if (x.kind === 'wait') expect(x.then).toBeUndefined()
    expect(thens(steps)).toEqual([])
  })

  it('cleans faster to the clock when sped up', () => {
    const d = new Director(lcg(43), 10)
    const waited = d.cleaning(scene(), 90_000).reduce((n, x) => n + (x.kind === 'wait' ? x.ms : 0), 0)
    expect(waited).toBeGreaterThanOrEqual(9000)
    expect(waited).toBeLessThan(13_000)
  })

  it('does the job it is told to (for a trial), whatever it would have chosen, and rests after it as always', () => {
    const d = new Director(lcg(51))
    const bin = d.boyPlan(scene(), 'bin')
    expect(thens(bin)).toEqual(['bag', 'drop'])
    expect(bin[bin.length - 1]).toMatchObject({ kind: 'wait', face: 'right' })
    expect(d.boyPlan(scene(), 'counter').some((x) => x.kind === 'wait' && x.prop === 'cloth')).toBe(true)
    expect(d.boyPlan(scene(), 'sweep').some((x) => x.kind === 'wait' && x.prop === 'broom')).toBe(true)
    expect(thens(d.boyPlan(scene({ idleAgents: [at(24, 6, 'left')] }), 'tray'))).toEqual(['tray', 'drop'])
    expect(thens(d.boyPlan(scene(), 'parcel'))).toEqual(['parcel', 'drop'])
  })
})
