import { describe, expect, it } from 'vitest'
import { ROLE, bannerFor } from './banner'

describe('the sign over the office while something is going on', () => {
  it('says FIRE DRILL in red, flashing, while a fire drill lasts, and POWER CUT in amber while the power is out', () => {
    const on = bannerFor('drill', 0)!
    expect(on).toMatchObject({ text: 'FIRE DRILL', tone: 'red' })
    const phases = new Set([0, 100, 400, 500, 800].map((t) => bannerFor('drill', t)!.lit))
    expect(phases).toEqual(new Set([true, false]))
    expect(bannerFor('cut', 0)).toMatchObject({ text: 'POWER CUT', tone: 'amber', lit: true })
    expect(bannerFor('cut', 400)!.lit).toBe(true)
  })

  it('says nothing for a pigeon or when nothing is happening', () => {
    expect(bannerFor('pigeon', 0)).toBeNull()
    expect(bannerFor('', 0)).toBeNull()
  })

  it('names each figure by its role for the label shown on hover', () => {
    expect(ROLE).toEqual({ cat: 'Cat', supervisor: 'Supervisor', boy: 'Office boy', guard: 'Guard', courier: 'Courier', pizza: 'Pizza delivery' })
  })
})
