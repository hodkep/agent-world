import type { Activity } from '../../shared/types'

// What the clock and chance ask of the office: the light and the sky by the hour, the lunch bell and chai time, the weather, the once-an-hour events,
// who comes to the door, and who has rested or worked long enough to nap or stretch. All of it only decides; the world draws and walks.

export type Phase = 'dawn' | 'day' | 'dusk' | 'night'
export type Ritual = 'lunch' | 'chai' | 'night'
export type WeatherNow = 'clear' | 'cloud' | 'rain'
export type RareEvent = 'drill' | 'cut' | 'pigeon'

const MIN = 60_000

export const phaseOf = (hour: number): Phase => (hour >= 5 && hour < 8 ? 'dawn' : hour >= 8 && hour < 17 ? 'day' : hour >= 17 && hour < 20 ? 'dusk' : 'night')

const TINTS: Record<Phase, { color: number; alpha: number }> = {
  dawn: { color: 0xf0b070, alpha: 0.12 },
  day: { color: 0xffffff, alpha: 0 },
  dusk: { color: 0xff9a50, alpha: 0.16 },
  night: { color: 0x101840, alpha: 0.38 }
}
/** The colour laid over the office floor at this hour. */
export const tintFor = (hour: number) => TINTS[phaseOf(hour)]

const ADDS: Record<Phase, { color: number; alpha: number } | null> = { dawn: { color: 0x2a2030, alpha: 0.55 }, day: { color: 0x243a2a, alpha: 0.9 }, dusk: { color: 0x2c1a0e, alpha: 0.6 }, night: null }

/**
 * The light on the grounds: a colour added to the lawn and the road (so they brighten from the night scene they are drawn as), a grey laid over them for cloud and rain,
 * whether the street lamps are lit, and whether rain falls.
 */
export function outsideLight(hour: number, weather: WeatherNow) {
  const phase = phaseOf(hour)
  const dim = weather === 'rain' ? 0.18 : weather === 'cloud' ? 0.08 : 0
  const base = phase === 'night' ? 0.18 : 0
  return { add: ADDS[phase], dim: { color: phase === 'night' ? 0x10182e : 0x6a7488, alpha: Math.max(dim, base) }, lamps: phase !== 'day', rain: weather === 'rain' }
}

const LIGHTS: Record<Phase, number> = { dawn: 0.5, day: 0, dusk: 0.6, night: 1 }

/** How strongly the lights over the desks shine at this hour (0 to 1): on at night, dimmer at dawn and dusk, off by day, and out as the power cut takes the light (`dark`, 0 to 1). */
export const lightStrength = (hour: number, dark: number) => LIGHTS[phaseOf(hour)] * (1 - Math.min(1, Math.max(0, dark)))

/** The lunch bell rings from one to two, chai is called from four to half past, and the cleaner works from ten at night to five. */
export function ritualAt(hour: number, minute: number): Ritual | null {
  if (hour === 13) return 'lunch'
  if (hour === 16 && minute < 30) return 'chai'
  if (hour >= 22 || hour < 5) return 'night'
  return null
}

/** How long each weather lasts, in minutes: clear sky is long, cloud is a spell, rain is a short one. */
const SPELL: Record<WeatherNow, [number, number]> = { clear: [20, 40], cloud: [8, 15], rain: [4, 8] }

/** Made-up weather that moves one step at a time: clear, cloud, then clear again or rain, then cloud. Rain is a short spell and a few percent of the time. */
export class Weather {
  now: WeatherNow
  private left: number

  constructor(
    private readonly rand: () => number,
    private readonly speed = 1
  ) {
    this.now = (['clear', 'cloud', 'rain'] as const)[Math.floor(rand() * 3)]!
    this.left = this.span()
  }

  private span() {
    const [lo, hi] = SPELL[this.now]
    return (lo + this.rand() * (hi - lo)) * MIN
  }

  tick(dtMs: number) {
    this.left -= dtMs * this.speed
    if (this.left > 0) return
    // From cloud the sky clears seven times in ten and rains three; from clear or rain it goes back to cloud.
    this.now = this.now === 'cloud' ? (this.rand() < 0.7 ? 'clear' : 'rain') : 'cloud'
    this.left = this.span()
  }
}

/** A fire drill, a power cut or a pigeon: not in the first twenty minutes, and at least an hour apart. */
export class Rare {
  private left: number

  constructor(
    private readonly rand: () => number,
    private readonly speed = 1
  ) {
    this.left = 20 * MIN + rand() * 40 * MIN
  }

  decide(dtMs: number): RareEvent | null {
    this.left -= dtMs * this.speed
    if (this.left > 0) return null
    return this.call((['drill', 'cut', 'pigeon'] as const)[Math.floor(this.rand() * 3)]!)
  }

  /** Starts one now (for trials and specs). */
  call(kind: RareEvent): RareEvent {
    this.left = 60 * MIN + this.rand() * 60 * MIN
    return kind
  }
}

/** The courier comes every fifteen to twenty-five minutes; a pizza after a task finished late; the guard stands at the gate in the evening. */
export class Guests {
  private left: number
  private pizzaed = false

  constructor(
    private readonly rand: () => number,
    private readonly speed = 1
  ) {
    this.left = this.span()
  }

  static guardOn = (hour: number) => hour >= 17 && hour < 23

  private span() {
    return 15 * MIN + this.rand() * 10 * MIN
  }

  tick(dtMs: number, _hour: number): 'courier' | null {
    this.left -= dtMs * this.speed
    if (this.left > 0) return null
    this.left = this.span()
    return 'courier'
  }

  /** A task has been finished at this hour: true for the first one of an evening, when pizza is ordered. */
  pizzaAfterTask(hour: number): boolean {
    if (hour < 20) {
      this.pizzaed = false
      return false
    }
    if (this.pizzaed) return false
    this.pizzaed = true
    return true
  }
}

const WORKING: ReadonlySet<string> = new Set(['thinking', 'researching', 'implementing', 'running', 'delegating', 'compacting'])
const NAP_MS = 2 * MIN
const LONG_TURN_MS = 10 * MIN

/** Who has been idle long enough to nap, and who has just ended a long turn and should stretch. */
export class Rest {
  private readonly idleSince = new Map<string, number>()
  private readonly workSince = new Map<string, number>()

  observe(key: string, activity: Activity, now: number): 'stretch' | null {
    if (WORKING.has(activity)) {
      this.idleSince.delete(key)
      if (!this.workSince.has(key)) this.workSince.set(key, now)
      return null
    }
    if (activity !== 'idle') return null
    const began = this.workSince.get(key)
    this.workSince.delete(key)
    if (!this.idleSince.has(key)) this.idleSince.set(key, now)
    return began !== undefined && now - began >= LONG_TURN_MS ? 'stretch' : null
  }

  napping(key: string, now: number) {
    const since = this.idleSince.get(key)
    return since !== undefined && now - since >= NAP_MS
  }

  forget(key: string) {
    this.idleSince.delete(key)
    this.workSince.delete(key)
  }
}
