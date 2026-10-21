import type { Ritual } from './rituals'

export type LifePlan = { kind: 'drink'; agent: string; what: 'water' | 'coffee' } | { kind: 'game'; agents: string[] } | { kind: 'huddle'; agents: string[] } | { kind: 'eat'; agent: string }

/** What the office has for them: whether a game is on, and what is left in the cooler and the pot. */
export interface LifeState {
  game: boolean
  water: number
  coffee: number
  /** The hour's ritual, if there is one: lunch or chai bring idle agents to the table or the counter. */
  ritual?: Ritual | null
  /** Whether a whiteboard huddle is on; left out when the office has none to offer. */
  huddle?: boolean
}

const GAP_MS: [number, number] = [8000, 16000]
const FIRST_MS = 6000
const GAME_CHANCE = 0.45
const HUDDLE_CHANCE = 0.3
const RITUAL_CHANCE = 0.7

/**
 * What idle agents do with their time, now and then: one fetches a cup of water or coffee, or a pair or four of them sit down to carrom. It only decides who and what;
 * the world walks them there, and calls them back the moment one of them has work. A few seconds always pass between one plan and the next.
 */
export class Life {
  private wait: number

  constructor(
    private readonly rand: () => number,
    private readonly speed = 1
  ) {
    this.wait = FIRST_MS / speed
  }

  decide(dtMs: number, idle: string[], state: LifeState): LifePlan | null {
    this.wait -= dtMs
    if (this.wait > 0 || idle.length === 0) return null
    this.wait = (GAP_MS[0] + this.rand() * (GAP_MS[1] - GAP_MS[0])) / this.speed
    if (state.ritual === 'lunch' && this.rand() < RITUAL_CHANCE) return { kind: 'eat', agent: idle[Math.floor(this.rand() * idle.length)]! }
    if (state.ritual === 'chai' && state.coffee > 0.15 && this.rand() < RITUAL_CHANCE) return { kind: 'drink', agent: idle[Math.floor(this.rand() * idle.length)]!, what: 'coffee' }
    if (state.huddle === false && idle.length >= 2 && this.rand() < HUDDLE_CHANCE) {
      const pool = [...idle]
      const size = idle.length >= 3 && this.rand() < 0.5 ? 3 : 2
      const agents: string[] = []
      while (agents.length < size) agents.push(pool.splice(Math.floor(this.rand() * pool.length), 1)[0]!)
      return { kind: 'huddle', agents }
    }
    if (!state.game && idle.length >= 2 && this.rand() < GAME_CHANCE) {
      const seats = idle.length >= 4 && this.rand() < 0.5 ? 4 : 2
      const pool = [...idle]
      const agents: string[] = []
      while (agents.length < seats) agents.push(pool.splice(Math.floor(this.rand() * pool.length), 1)[0]!)
      return { kind: 'game', agents }
    }
    const what = state.coffee > 0.15 && (state.water < 0.05 || this.rand() < 0.5) ? 'coffee' : state.water >= 0.05 ? 'water' : null
    if (!what) return null
    return { kind: 'drink', agent: idle[Math.floor(this.rand() * idle.length)]!, what }
  }
}
