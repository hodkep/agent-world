import { describe, expect, it } from 'vitest'
import { Director, SUPERVISOR_LINES, type Scene } from './staff'

/** A random source that returns the given numbers in turn, then repeats the last. */
const seq = (...xs: number[]) => {
  let i = 0
  return () => xs[Math.min(i++, xs.length - 1)]!
}
const spot = (x: number, y: number) => ({ to: { x, y }, face: 'up' as const })
const scene = (o: Partial<Scene> = {}): Scene => ({
  working: [],
  idle: 0,
  spots: { door: { x: 8, y: 16 }, cooler: spot(17, 3), bin: spot(2, 14), counter: spot(24, 14), corner: { x: 21, y: 12 } },
  boy: { x: 5, y: 5 },
  boyCarrying: false,
  meet: { to: { x: 6, y: 5 }, face: 'left' },
  ...o
})

describe('the water in the cooler', () => {
  it('falls with the idle agents who are around, faster with more of them, and never below nothing', () => {
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

  it('is refilled to the top, and runs low below a fifth', () => {
    const d = new Director(seq(0.5))
    d.tick(10_000_000, 1)
    expect(d.low).toBe(true)
    d.refill()
    expect(d.water).toBe(1)
    expect(d.low).toBe(false)
  })

  it('can fall faster while the staff keep their own pace, so the refill can be watched without their stops and callouts being cut short', () => {
    const slow = new Director(seq(0.5))
    const watery = new Director(seq(0.5), 1, 8)
    slow.tick(1000, 2)
    watery.tick(1000, 2)
    expect(1 - watery.water).toBeCloseTo((1 - slow.water) * 8, 5)
    expect(watery.supervisorPlan(scene()).steps[1]).toMatchObject({ kind: 'wait', ms: 9000 })
  })

  it('goes faster when the clock is sped up, for specs', () => {
    const slow = new Director(seq(0.5))
    const fast = new Director(seq(0.5), 10)
    slow.tick(1000, 2)
    fast.tick(1000, 2)
    expect(1 - fast.water).toBeCloseTo((1 - slow.water) * 10, 5)
  })
})

describe('what the supervisor does', () => {
  it('walks to an agent that is working, stands beside it for a few seconds and says one of his lines, facing the agent', () => {
    const d = new Director(seq(0, 0.5))
    const plan = d.supervisorPlan(scene({ working: [{ to: { x: 4, y: 6 }, face: 'left' }, { to: { x: 9, y: 6 }, face: 'left' }] }))
    expect(plan.steps[0]).toEqual({ kind: 'walk', to: { x: 4, y: 6 } })
    const wait = plan.steps[1]!
    expect(wait).toMatchObject({ kind: 'wait', face: 'left' })
    expect(SUPERVISOR_LINES).toContain((wait as { say: string }).say)
    expect((wait as { ms: number }).ms).toBeGreaterThanOrEqual(3000)
    expect((wait as { ms: number }).ms).toBeLessThanOrEqual(5000)
  })

  it('does not stand at the same agent twice running while others work', () => {
    const d = new Director(seq(0))
    const s = scene({ working: [{ to: { x: 4, y: 6 }, face: 'left' }, { to: { x: 9, y: 6 }, face: 'left' }] })
    const first = d.supervisorPlan(s).steps[0]
    const second = d.supervisorPlan(s).steps[0]
    expect(first).not.toEqual(second)
  })

  it('stays by the corner of the lounge when nobody works, and does not go to anyone', () => {
    const d = new Director(seq(0.5))
    const plan = d.supervisorPlan(scene())
    expect(plan.steps[0]).toEqual({ kind: 'walk', to: { x: 21, y: 12 } })
    expect(plan.steps).toHaveLength(2)
    expect(plan.meetsBoy).toBe(false)
  })

  it('now and then goes to the office boy next, says what to do, and the office boy is told which job', () => {
    // The draws, in turn: the agent, the line, how long he stays, whether he goes on to the office boy, and which job.
    const d = new Director(seq(0, 0, 0.5, 0.05, 0.9))
    const plan = d.supervisorPlan(scene({ working: [{ to: { x: 4, y: 6 }, face: 'left' }] }))
    expect(plan.meetsBoy).toBe(true)
    const meet = plan.steps.slice(-2)
    expect(meet[0]).toEqual({ kind: 'walk', to: { x: 6, y: 5 } })
    expect(meet[1]).toMatchObject({ kind: 'wait', face: 'left', pose: 'point', then: 'order' })
    expect(typeof (meet[1] as { say: string }).say).toBe('string')
  })

  it('does not stop the office boy while he carries a jar, and not again within half a minute of the last order', () => {
    const d = new Director(seq(0.05))
    const working = [{ to: { x: 4, y: 6 }, face: 'left' as const }]
    expect(d.supervisorPlan(scene({ working, boyCarrying: true })).meetsBoy).toBe(false)
    expect(d.supervisorPlan(scene({ working })).meetsBoy).toBe(true)
    expect(d.supervisorPlan(scene({ working })).meetsBoy).toBe(false)
    d.tick(31_000, 0)
    expect(d.supervisorPlan(scene({ working })).meetsBoy).toBe(true)
  })

  it('orders the cooler refilled when its water is low', () => {
    const d = new Director(seq(0, 0, 0.5, 0.05))
    d.tick(10_000_000, 1)
    const plan = d.supervisorPlan(scene({ working: [{ to: { x: 4, y: 6 }, face: 'left' }] }))
    expect((plan.steps.at(-1) as { say: string }).say).toBe('Refill the cooler!')
    expect(d.order).toBe('refill')
  })
})

describe('what the office boy does', () => {
  it('fetches a jar from the door when the water is low, swaps it at the cooler (the old one out, the new one in), and carries the old one back out', () => {
    const d = new Director(seq(0.5))
    d.tick(10_000_000, 1)
    const steps = d.boyPlan(scene())
    expect(steps.map((s) => (s.kind === 'wait' ? `wait:${s.then ?? ''}` : 'walk'))).toEqual(['walk', 'wait:fetch', 'walk', 'wait:swapOut', 'wait:swapIn', 'wait:pickOld', 'walk', 'wait:drop'])
    expect(steps[0]).toEqual({ kind: 'walk', to: { x: 8, y: 16 } })
    expect(steps[2]).toEqual({ kind: 'walk', to: { x: 17, y: 3 } })
    expect(steps[3]).toMatchObject({ face: 'up' })
    expect(steps[6]).toEqual({ kind: 'walk', to: { x: 8, y: 16 } })
  })

  it('takes the rubbish out when told to empty the bin, and wipes the counter with a cloth when told to', () => {
    const d = new Director(seq(0.5))
    d.order = 'bin'
    const bin = d.boyPlan(scene())
    expect(bin.map((s) => (s.kind === 'wait' ? `wait:${s.then ?? s.pose ?? ''}` : 'walk'))).toEqual(['wait:salute', 'walk', 'wait:bag', 'walk', 'wait:drop'])
    d.order = 'counter'
    const counter = d.boyPlan(scene())
    expect(counter.at(-1)).toMatchObject({ kind: 'wait', pose: 'wipe', face: 'up' })
  })

  it('salutes the supervisor first when he was ordered, for about a second, then does the job', () => {
    const d = new Director(seq(0.5))
    d.order = 'bin'
    const steps = d.boyPlan(scene())
    expect(steps[0]).toMatchObject({ kind: 'wait', pose: 'salute' })
    expect((steps[0] as { ms: number }).ms).toBeGreaterThanOrEqual(900)
    expect(steps[1]).toEqual({ kind: 'walk', to: { x: 2, y: 14 } })
    expect(d.order).toBeNull()
  })

  it('does a chore in between, never standing still for long', () => {
    const d = new Director(seq(0.1, 0.5, 0.9))
    for (let i = 0; i < 3; i++) {
      const steps = d.boyPlan(scene())
      expect(steps.length).toBeGreaterThan(0)
      expect(steps.some((s) => s.kind === 'walk')).toBe(true)
    }
  })
})
