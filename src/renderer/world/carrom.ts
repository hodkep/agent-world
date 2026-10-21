export type CarromEvent =
  | { type: 'strike'; player: number }
  | { type: 'pocket'; player: number; coin: 'black' | 'white' | 'queen' | null }
  | { type: 'over'; winner: number }

/** The coins on the board: nine of each colour and the queen. */
const COINS = { black: 9, white: 9, queen: 1 }
const STRIKE_MS = 2400
const POCKET_CHANCE = 0.5
const MAX_STRIKES = 26

/**
 * A game of carrom among two or four: one strike every couple of seconds, each taking a turn in order, a player who pockets a coin goes on. It draws nothing:
 * the board, the players' arms and what they shout are made from its events. Black and white coins are a point, the queen three; the most points wins.
 */
export class Carrom {
  readonly scores: number[]
  readonly coins = { ...COINS }
  strikes = 0
  turn = 0
  over = false
  /** The strike that was last made, for drawing it: which player, whether it pocketed, and the time since. */
  last: { player: number; coin: 'black' | 'white' | 'queen' | null; ago: number } | null = null
  private wait: number

  constructor(
    readonly seats: number,
    private readonly rand: () => number,
    private readonly speed = 1
  ) {
    if (seats !== 2 && seats !== 4) throw new Error('Carrom is played by two or four.')
    this.scores = Array<number>(seats).fill(0)
    this.wait = STRIKE_MS / 2 / speed
  }

  get coinsLeft() {
    return this.coins.black + this.coins.white + this.coins.queen
  }

  update(dtMs: number): CarromEvent[] {
    if (this.over) return []
    if (this.last) this.last.ago += dtMs
    this.wait -= dtMs
    if (this.wait > 0) return []
    this.wait = (STRIKE_MS * (0.8 + this.rand() * 0.4)) / this.speed
    const player = this.turn
    this.strikes++
    const events: CarromEvent[] = [{ type: 'strike', player }]
    let coin: 'black' | 'white' | 'queen' | null = null
    if (this.rand() < POCKET_CHANCE && this.coinsLeft > 0) {
      const pool = (['black', 'white', 'queen'] as const).filter((c) => this.coins[c] > 0)
      coin = pool.includes('queen') && this.rand() < 0.1 ? 'queen' : pool.filter((c) => c !== 'queen')[Math.floor(this.rand() * pool.filter((c) => c !== 'queen').length)] ?? pool[0]!
      this.coins[coin]--
      this.scores[player] = (this.scores[player] ?? 0) + (coin === 'queen' ? 3 : 1)
      events.push({ type: 'pocket', player, coin })
    } else {
      this.turn = (this.turn + 1) % this.seats
    }
    this.last = { player, coin, ago: 0 }
    if (this.coinsLeft === 0 || this.strikes >= MAX_STRIKES) {
      this.over = true
      events.push({ type: 'over', winner: this.scores.indexOf(Math.max(...this.scores)) })
    }
    return events
  }
}
