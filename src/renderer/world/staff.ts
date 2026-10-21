import type { StaffPose } from './staffSprites'

export interface Pt {
  x: number
  y: number
}
export type Face = 'up' | 'down' | 'left' | 'right'

/** One thing a staff member does: walk to a tile, or stand and do something there for a while. */
export type Step =
  | { kind: 'walk'; to: Pt }
  | { kind: 'wait'; ms: number; pose?: StaffPose; face?: Face; say?: string; then?: Then }

/** What happens when a wait starts: a jar fetched, the cooler's old jar lifted out, the new one put in, the old one picked up, a bag of rubbish taken, what he carried put down, or an order given. */
export type Then = 'fetch' | 'swapOut' | 'swapIn' | 'pickOld' | 'bag' | 'drop' | 'order'

export type Job = 'refill' | 'bin' | 'counter'

/** What the world tells the director each time a staff member needs something to do. */
export interface Scene {
  /** A place beside each agent that is working, and the way to face it. */
  working: { to: Pt; face: Face }[]
  /** Idle agents in the office: the cooler's water falls with them. */
  idle: number
  spots: { door: Pt; cooler: { to: Pt; face: Face }; bin: { to: Pt; face: Face }; counter: { to: Pt; face: Face }; corner: Pt }
  /** Where the office boy is, and the place next to him where the supervisor stands to give an order. */
  boy: Pt
  /** He is on his way to the cooler with a jar: he is not stopped for an order. */
  boyCarrying: boolean
  meet: { to: Pt; face: Face }
}

export const SUPERVISOR_LINES = ['Any blockers?', 'ETA?', 'Is it in the sprint?', 'Per my last email']
const ORDERS: Record<Job, string> = { refill: 'Refill the cooler!', bin: 'Empty the bin!', counter: 'Wipe the counter!' }

/** How long a jar lasts one idle agent, and below what share the office boy brings a new one. */
const JAR_MS = 30 * 60_000
const LOW = 0.2
const VISIT_MS: [number, number] = [3000, 5000]
const MEET_CHANCE = 0.3
/** At least this long between one order and the next. */
const MEET_GAP_MS = 30_000

/**
 * What the two staff do next. It draws nothing and moves nothing: it hands out lists of steps from the time, a random source, where agents work and how much water is left,
 * so the same draws give the same office. `speed` shortens every wait and the gap between orders, `waterSpeed` the water's fall: both for specs and for trying it out.
 */
export class Director {
  water = 1
  /** What the supervisor told the office boy to do and he has not started yet. */
  order: Job | null = null
  private lastVisit = -1
  private sinceOrder = MEET_GAP_MS

  constructor(
    private readonly rand: () => number,
    private readonly speed = 1,
    private readonly waterSpeed = speed
  ) {}

  get low() {
    return this.water < LOW
  }

  tick(dtMs: number, idle: number) {
    this.water = Math.max(0, this.water - (idle * dtMs * this.waterSpeed) / JAR_MS)
    this.sinceOrder += dtMs * this.speed
  }

  refill() {
    this.water = 1
  }

  private ms(lo: number, hi: number) {
    return Math.round((lo + this.rand() * (hi - lo)) / this.speed)
  }

  /** Where the supervisor goes next. `meetsBoy` says he ends by giving the office boy an order, so the office boy should wait for him. */
  supervisorPlan(scene: Scene): { steps: Step[]; meetsBoy: boolean } {
    const n = scene.working.length
    if (n === 0) {
      this.lastVisit = -1
      return { steps: [{ kind: 'walk', to: scene.spots.corner }, { kind: 'wait', ms: this.ms(6000, 12000) }], meetsBoy: false }
    }
    let at = Math.floor(this.rand() * n) % n
    if (n > 1 && at === this.lastVisit) at = (at + 1) % n
    this.lastVisit = at
    const place = scene.working[at]!
    const say = SUPERVISOR_LINES[Math.floor(this.rand() * SUPERVISOR_LINES.length)]!
    const steps: Step[] = [{ kind: 'walk', to: place.to }, { kind: 'wait', ms: this.ms(...VISIT_MS), face: place.face, say }]
    if (scene.boyCarrying || this.sinceOrder < MEET_GAP_MS || this.rand() >= MEET_CHANCE) return { steps, meetsBoy: false }
    this.sinceOrder = 0
    const job: Job = this.low ? 'refill' : this.rand() < 0.5 ? 'bin' : 'counter'
    this.order = job
    steps.push({ kind: 'walk', to: scene.meet.to }, { kind: 'wait', ms: this.ms(1600, 1800), face: scene.meet.face, pose: 'point', say: ORDERS[job], then: 'order' })
    return { steps, meetsBoy: true }
  }

  /** The office boy's next job: the one he was ordered (after a salute), the cooler when it is low, or a chore. */
  boyPlan(scene: Scene): Step[] {
    const ordered = this.order
    this.order = null
    const job: Job | 'rest' = ordered ?? (this.low ? 'refill' : (['bin', 'counter', 'rest'] as const)[Math.min(2, Math.floor(this.rand() * 3))]!)
    const salute: Step[] = ordered ? [{ kind: 'wait', ms: Math.round(1100 / this.speed), pose: 'salute' }] : []
    const { spots } = scene
    const wait = (ms: number, more: Omit<Extract<Step, { kind: 'wait' }>, 'kind' | 'ms'> = {}): Step => ({ kind: 'wait', ms: Math.round(ms / this.speed), ...more })
    const out: Step[] = [{ kind: 'walk', to: spots.door }, wait(500, { then: 'drop' })]
    switch (job) {
      case 'refill':
        return [
          ...salute,
          { kind: 'walk', to: spots.door },
          wait(900, { then: 'fetch' }),
          { kind: 'walk', to: spots.cooler.to },
          wait(700, { face: spots.cooler.face, then: 'swapOut' }),
          wait(1000, { face: spots.cooler.face, then: 'swapIn' }),
          wait(600, { face: spots.cooler.face, then: 'pickOld' }),
          ...out
        ]
      case 'bin':
        return [...salute, { kind: 'walk', to: spots.bin.to }, wait(900, { face: spots.bin.face, then: 'bag' }), ...out]
      case 'counter':
        return [...salute, { kind: 'walk', to: spots.counter.to }, wait(2400, { face: spots.counter.face, pose: 'wipe' })]
      default:
        return [{ kind: 'walk', to: spots.door }, { kind: 'wait', ms: this.ms(5000, 9000) }]
    }
  }
}
