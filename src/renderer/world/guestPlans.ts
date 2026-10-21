import type { Place, Pt, Step } from './staff'

const wait = (ms: number, more: Omit<Extract<Step, { kind: 'wait' }>, 'kind' | 'ms'> = {}): Step => ({ kind: 'wait', ms, ...more })

/** The courier comes in at the door with a parcel, puts it down at the counter, and goes out again. */
export const courierSteps = (door: Pt, drop: Place): Step[] => [
  wait(600, { then: 'parcel' }),
  { kind: 'walk', to: drop.to },
  wait(1100, { face: drop.face, then: 'drop' }),
  { kind: 'walk', to: door }
]

/** The pizza delivery: a box carried to an idle agent, with a shout, and out again. */
export const pizzaSteps = (door: Pt, to: Place): Step[] => [
  wait(600, { then: 'parcel' }),
  { kind: 'walk', to: to.to },
  wait(2200, { face: to.face, say: 'Pizza!', then: 'drop' }),
  { kind: 'walk', to: door }
]

/** The guard stands in the doorway looking at the street, and now and then salutes. */
export const guardSteps = (): Step[] => [wait(18_000, { face: 'down' }), wait(1600, { face: 'down', pose: 'salute' })]
