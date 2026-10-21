import type { StaffPose } from './staffSprites'

export interface Pt {
  x: number
  y: number
}
export type Face = 'up' | 'down' | 'left' | 'right'
/** A tile to stand on and the way to face from it. */
export interface Place {
  to: Pt
  face: Face
}

/** What he holds in his hands for as long as one wait lasts. */
export type Prop = 'cup' | 'book' | 'phone' | 'cloth' | 'broom' | 'can'

/** One thing a staff member does: walk to a tile, or stand and do something there for a while. */
export type Step =
  | { kind: 'walk'; to: Pt }
  | { kind: 'wait'; ms: number; pose?: StaffPose; prop?: Prop; face?: Face; say?: string; then?: Then }

/**
 * What happens when a wait starts: the cooler's empty jar lifted out, set under the tap (it fills) and taken up full, then put in; a book taken from the shelf or put back; a jar fetched, the old one picked up, a bag, a parcel or a tray taken up,
 * what he carried put down, a sip of water or coffee, a pot of coffee made, or an order given.
 */
export type Then = 'fetch' | 'swapOut' | 'fill' | 'takeJar' | 'takeBook' | 'putBook' | 'swapIn' | 'pickOld' | 'bag' | 'parcel' | 'tray' | 'drop' | 'sipWater' | 'sipCoffee' | 'brew' | 'order'

export type Job = 'refill' | 'coffee' | 'bin' | 'counter' | 'plants' | 'sweep' | 'printer' | 'tables' | 'parcel' | 'tray'
/** The jobs the supervisor can give. */
const ORDERABLE: Job[] = ['bin', 'counter', 'plants', 'sweep']
export type SupervisorKind = 'visit' | 'read' | 'coffee' | 'water' | 'paint' | 'call' | 'look' | 'outside' | 'order'

/** What the world tells the director each time a staff member needs something to do. */
export interface Scene {
  /** A place beside each agent that is working, and the way to face it. */
  working: Place[]
  /** Idle agents in the office: the cooler's water falls with them. */
  idle: number
  spots: {
    door: Pt
    cooler: Place
    bin: Place
    counter: Place
    coffee: Place
    printer: Place
    /** Where the kitchen sink's tap is, and the way to face it. */
    sink: Place
    corner: Pt
    plants: Place[]
    shelves: Place[]
    paintings: Place[]
    tables: Place[]
    kanban: Place[]
    phone: Place[]
    /** The doorway, where one can stand and look out at the street. */
    outside: Place[]
    sweep: Pt[]
  }
  /** Where the office boy is, and the place next to him where the supervisor stands to give an order. */
  boy: Pt
  /** He is carrying something: he is not stopped for an order. */
  boyCarrying: boolean
  meet: Place
  /** A place beside each idle agent, where a tray can be put down. */
  idleAgents: Place[]
}

export const SUPERVISOR_LINES = ['Any blockers?', 'ETA?', 'Is it in the sprint?', 'Per my last email']
export const PHONE_LINES = ['Hello? Yes, yes...', 'Let me circle back.', 'Can we take this offline?']
const ORDERS: Record<string, string> = { refill: 'Refill the cooler!', bin: 'Empty the bin!', counter: 'Wipe the counter!', plants: 'Water the plants!', sweep: 'Sweep the floor!' }

/** How long a jar lasts one idle agent, and below what share the office boy brings a new one. */
const JAR_MS = 30 * 60_000
const LOW = 0.2
/** A cup of water, and a cup of coffee, as a share of what is there. */
const WATER_CUP = 0.04
const COFFEE_CUP = 0.12
const COFFEE_LOW = 0.25
const VISIT_MS: [number, number] = [3000, 5000]
/** At least this long between one order and the next, between one round of the supervisor's and the next, and before he stands at the same agent again. */
const MEET_GAP_MS = 30_000
const VISIT_GAP_MS = 45_000
const SAME_AGENT_MS = 120_000
const WEIGHTS: Record<SupervisorKind, number> = { visit: 3, read: 3, coffee: 2, water: 2, paint: 2, call: 2, look: 1, outside: 1.5, order: 1.5 }
const BOY_WEIGHTS: Record<Exclude<Job, 'refill' | 'coffee'>, number> = { bin: 1, counter: 1, plants: 1.5, sweep: 1.5, printer: 1, tables: 1, parcel: 1, tray: 1.5 }

const key = (p: Pt) => `${p.x},${p.y}`

/**
 * What the two staff do next. It draws nothing and moves nothing: it hands out lists of steps from the time, a random source, where agents work and how much water and coffee
 * is left, so the same draws give the same office. Neither of them is ever left with nothing to do. `speed` shortens every wait and the gaps between orders and rounds,
 * `waterSpeed` the water's fall: both for specs and for trying it out.
 */
export class Director {
  water = 1
  coffee = 1
  /** What the supervisor told the office boy to do and he has not started yet. */
  order: Job | null = null
  private clock = 0
  private sinceOrder = MEET_GAP_MS
  private sinceVisit = VISIT_GAP_MS
  private lastKind: SupervisorKind | null = null
  private lastJob: Job | null = null
  private readonly visited = new Map<string, number>()

  constructor(
    private readonly rand: () => number,
    private readonly speed = 1,
    private readonly waterSpeed = speed
  ) {}

  get low() {
    return this.water < LOW
  }

  get coffeeLow() {
    return this.coffee < COFFEE_LOW
  }

  tick(dtMs: number, idle: number) {
    this.water = Math.max(0, this.water - (idle * dtMs * this.waterSpeed) / JAR_MS)
    this.clock += dtMs * this.speed
    this.sinceOrder += dtMs * this.speed
    this.sinceVisit += dtMs * this.speed
  }

  refill() {
    this.water = 1
  }

  brew() {
    this.coffee = 1
  }

  /** Someone drinks a cup. */
  sip(what: 'water' | 'coffee') {
    if (what === 'water') this.water = Math.max(0, this.water - WATER_CUP)
    else this.coffee = Math.max(0, this.coffee - COFFEE_CUP)
  }

  private ms(lo: number, hi: number) {
    return Math.round((lo + this.rand() * (hi - lo)) / this.speed)
  }

  /** A random length of time between two, before any speeding up. */
  private span(lo: number, hi: number) {
    return lo + this.rand() * (hi - lo)
  }

  private wait(ms: number, more: Omit<Extract<Step, { kind: 'wait' }>, 'kind' | 'ms'> = {}): Step {
    return { kind: 'wait', ms: Math.round(ms / this.speed), ...more }
  }

  private pick<T>(xs: readonly T[]): T {
    return xs[Math.min(xs.length - 1, Math.floor(this.rand() * xs.length))]!
  }

  /** One of `kinds` by weight, never the one done last when there is another. */
  private weighted<K extends string>(kinds: K[], weight: (k: K) => number, last: K | null): K {
    const from = kinds.length > 1 ? kinds.filter((k) => k !== last) : kinds
    let r = this.rand() * from.reduce((n, k) => n + weight(k), 0)
    for (const k of from) {
      r -= weight(k)
      if (r < 0) return k
    }
    return from[from.length - 1]!
  }

  /** What the supervisor can do just now. */
  supervisorOptions(scene: Scene): SupervisorKind[] {
    const s = scene.spots
    const eligible = scene.working.some((p) => this.clock - (this.visited.get(key(p.to)) ?? -Infinity) >= SAME_AGENT_MS)
    const out: SupervisorKind[] = []
    if (scene.working.length && eligible && this.sinceVisit >= VISIT_GAP_MS) out.push('visit')
    if (s.shelves.length) out.push('read')
    if (this.coffee >= 0.15) out.push('coffee')
    if (this.water >= 0.1) out.push('water')
    if (s.paintings.length) out.push('paint')
    if (s.phone.length) out.push('call')
    if (s.kanban.length) out.push('look')
    if (s.outside.length) out.push('outside')
    if (!scene.boyCarrying && this.sinceOrder >= MEET_GAP_MS) out.push('order')
    return out
  }

  /**
   * Where the supervisor goes next, and for what. `meetsBoy` says it ends in an order for the office boy, so he should wait for it. `only` makes the choice (for specs).
   * He never has nothing to do: when nothing else is possible he walks to the lounge corner for a few seconds.
   */
  supervisorPlan(scene: Scene, only?: SupervisorKind): { steps: Step[]; meetsBoy: boolean; kind: SupervisorKind | 'rest' } {
    const options = this.supervisorOptions(scene)
    const kind = only ?? (options.length ? this.weighted(options, (k) => WEIGHTS[k], this.lastKind) : null)
    if (!kind) return { steps: [{ kind: 'walk', to: scene.spots.corner }, { kind: 'wait', ms: this.ms(4000, 7000) }], meetsBoy: false, kind: 'rest' }
    this.lastKind = kind
    const s = scene.spots
    const at = (p: Place, ms: number, more: Omit<Extract<Step, { kind: 'wait' }>, 'kind' | 'ms' | 'face'> = {}): Step[] => [{ kind: 'walk', to: p.to }, this.wait(ms, { face: p.face, ...more })]
    switch (kind) {
      case 'visit': {
        const fresh = scene.working.filter((p) => this.clock - (this.visited.get(key(p.to)) ?? -Infinity) >= SAME_AGENT_MS)
        const place = this.pick(fresh.length ? fresh : scene.working)
        this.visited.set(key(place.to), this.clock)
        this.sinceVisit = 0
        const say = this.pick(SUPERVISOR_LINES)
        return { steps: [{ kind: 'walk', to: place.to }, { kind: 'wait', ms: this.ms(...VISIT_MS), face: place.face, say }], meetsBoy: false, kind }
      }
      case 'read': {
        // He takes a book from the shelf, turns round to the front to read it open in both hands, and puts it back.
        const shelf = this.pick(s.shelves)
        return {
          steps: [
            { kind: 'walk', to: shelf.to },
            this.wait(800, { face: shelf.face, pose: 'reach', then: 'takeBook' }),
            this.wait(this.span(7000, 11000), { face: 'down', pose: 'hold', prop: 'book' }),
            this.wait(800, { face: shelf.face, pose: 'reach', then: 'putBook' })
          ],
          meetsBoy: false,
          kind
        }
      }
      case 'outside':
        return { steps: at(this.pick(s.outside), this.span(6000, 10000), { pose: 'clasp' }), meetsBoy: false, kind }
      case 'coffee':
        return { steps: at(s.coffee, 2800, { pose: 'sip', prop: 'cup', then: 'sipCoffee' }), meetsBoy: false, kind }
      case 'water':
        return { steps: at(s.cooler, 2800, { pose: 'sip', prop: 'cup', then: 'sipWater' }), meetsBoy: false, kind }
      case 'paint':
        return { steps: at(this.pick(s.paintings), this.span(4000, 6500), { pose: 'chin' }), meetsBoy: false, kind }
      case 'look':
        return { steps: at(this.pick(s.kanban), this.span(3500, 5500), { pose: 'chin' }), meetsBoy: false, kind }
      case 'call':
        return { steps: at(this.pick(s.phone), this.span(5000, 7500), { pose: 'call', prop: 'phone', say: this.pick(PHONE_LINES) }), meetsBoy: false, kind }
      default: {
        const job: Job = this.low ? 'refill' : this.coffeeLow ? 'coffee' : this.pick(ORDERABLE)
        this.order = job
        this.sinceOrder = 0
        return { steps: [{ kind: 'walk', to: scene.meet.to }, this.wait(1700, { face: scene.meet.face, pose: 'point', say: ORDERS[job] ?? 'Get on it!', then: 'order' })], meetsBoy: true, kind }
      }
    }
  }

  /** The office boy's next job: the one he was ordered (after a salute), the cooler or the coffee when they run low, or a chore. Never nothing. */
  boyPlan(scene: Scene): Step[] {
    const ordered = this.order
    this.order = null
    let job: Job
    if (ordered) job = ordered
    else if (this.low) job = 'refill'
    else if (this.coffeeLow) job = 'coffee'
    else {
      const chores = (Object.keys(BOY_WEIGHTS) as (keyof typeof BOY_WEIGHTS)[]).filter((j) => j !== 'tray' || scene.idleAgents.length > 0)
      job = this.weighted(chores, (j) => BOY_WEIGHTS[j], this.lastJob as keyof typeof BOY_WEIGHTS | null)
    }
    this.lastJob = job
    const salute: Step[] = ordered ? [this.wait(1100, { pose: 'salute' })] : []
    const s = scene.spots
    const out: Step[] = [{ kind: 'walk', to: s.door }, this.wait(500, { then: 'drop' })]
    const go = (p: Place, ms: number, more: Omit<Extract<Step, { kind: 'wait' }>, 'kind' | 'ms' | 'face'> = {}): Step[] => [{ kind: 'walk', to: p.to }, this.wait(ms, { face: p.face, ...more })]
    switch (job) {
      case 'refill':
        // The empty jar comes out of the cooler, is filled at the kitchen sink's tap, and the full one goes back in.
        return [
          ...salute,
          { kind: 'walk', to: s.cooler.to },
          this.wait(700, { face: s.cooler.face, then: 'swapOut' }),
          { kind: 'walk', to: s.sink.to },
          this.wait(2200, { face: s.sink.face, pose: 'hold', then: 'fill' }),
          this.wait(400, { face: s.sink.face, then: 'takeJar' }),
          { kind: 'walk', to: s.cooler.to },
          this.wait(1000, { face: s.cooler.face, then: 'swapIn' })
        ]
      case 'coffee':
        return [...salute, ...go(s.coffee, 2200, { pose: 'hold', then: 'brew' })]
      case 'bin':
        return [...salute, ...go(s.bin, 900, { then: 'bag' }), ...out]
      case 'counter':
        return [...salute, ...go(s.counter, 2400, { pose: 'wipe', prop: 'cloth' })]
      case 'plants':
        return [...salute, ...go(this.pick(s.plants), 2400, { pose: 'hold', prop: 'can' })]
      case 'sweep': {
        const a = this.pick(s.sweep)
        const b = this.pick(s.sweep.filter((p) => key(p) !== key(a)).length ? s.sweep.filter((p) => key(p) !== key(a)) : s.sweep)
        const face = (from: Pt, to: Pt): Face => (to.x >= from.x ? 'right' : 'left')
        return [...salute, { kind: 'walk', to: a }, this.wait(2200, { face: face(a, b), pose: 'wipe', prop: 'broom' }), { kind: 'walk', to: b }, this.wait(2200, { face: face(b, a), pose: 'wipe', prop: 'broom' })]
      }
      case 'printer':
        return [...salute, ...go(s.printer, 2200, { pose: 'hold' })]
      case 'tables':
        return [...salute, ...go(this.pick(s.tables), 2400, { pose: 'wipe', prop: 'cloth' })]
      case 'parcel':
        return [{ kind: 'walk', to: s.door }, this.wait(900, { then: 'parcel' }), ...go(s.printer, 800, { then: 'drop' })]
      case 'tray': {
        const to = this.pick(scene.idleAgents)
        return [...go(s.coffee, 1200, { then: 'tray' }), ...go(to, 1800, { pose: 'hold', then: 'drop' })]
      }
    }
  }
}
