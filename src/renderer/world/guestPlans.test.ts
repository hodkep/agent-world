import { describe, expect, it } from 'vitest'
import { courierSteps, guardSteps, pizzaSteps } from './guestPlans'
import type { Place } from './staff'

const door = { x: 8, y: 16 }
const place = (x: number, y: number): Place => ({ to: { x, y }, face: 'up' })
const thens = (steps: ReturnType<typeof courierSteps>) => steps.flatMap((s) => (s.kind === 'wait' && s.then ? [s.then] : []))

describe('the people who come to the door', () => {
  it('a courier takes up the parcel, puts it down at the counter and leaves by the door', () => {
    const steps = courierSteps(door, place(21, 14))
    expect(thens(steps)).toEqual(['parcel', 'drop'])
    expect(steps.filter((s) => s.kind === 'walk').map((s) => (s as { to: unknown }).to)).toEqual([{ x: 21, y: 14 }, door])
    expect(steps[steps.length - 1]!.kind).toBe('walk')
  })

  it('the pizza comes to an idle agent with a shout, and goes', () => {
    const steps = pizzaSteps(door, place(24, 6))
    expect(thens(steps)).toEqual(['parcel', 'drop'])
    expect(steps.some((s) => s.kind === 'wait' && s.say === 'Pizza!')).toBe(true)
    expect((steps[steps.length - 1] as { to: unknown }).to).toEqual(door)
  })

  it('the guard stands facing the street and now and then salutes', () => {
    const steps = guardSteps()
    expect(steps.some((s) => s.kind === 'wait' && s.pose === 'salute')).toBe(true)
    expect(steps.every((s) => s.kind === 'wait' && s.face === 'down')).toBe(true)
  })
})
