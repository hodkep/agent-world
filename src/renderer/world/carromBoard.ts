import { Container, Graphics } from 'pixi.js'
import { TILE } from './office'

const INK = 0x1a1522
const COIN = { black: 0x2a2a32, white: 0xf4f4f8, queen: 0xd8303e } as const

/** The coins and the striker of the carrom game, drawn over the board table (the table itself is furniture): the playing surface is 24x18 pixels inside the frame. */
export class CarromBoard {
  readonly view = new Container()
  private readonly coins = new Graphics()
  private readonly striker = new Graphics()
  private flick: { from: { x: number; y: number }; ago: number } | null = null
  private drawn = ''

  constructor(tileX: number, tileY: number, private readonly tiles = { w: 2, h: 2 }) {
    this.view.x = tileX * TILE
    this.view.y = tileY * TILE
    this.view.zIndex = (tileY + tiles.h) * TILE + 0.5
    this.view.addChild(this.coins, this.striker)
  }

  /** Where the players stand: the middle of each side of the board, in the board's own pixels. */
  private side(player: number, seats: number) {
    const w = this.tiles.w * TILE
    const h = this.tiles.h * TILE
    const sides = seats === 2 ? [{ x: 4, y: h / 2 }, { x: w - 4, y: h / 2 }] : [{ x: 4, y: h / 2 }, { x: w - 4, y: h / 2 }, { x: w / 2, y: 7 }, { x: w / 2, y: h - 8 }]
    return sides[player] ?? sides[0]!
  }

  /** A strike by this player: the striker slides from their side to the middle. */
  strike(player: number, seats: number) {
    this.flick = { from: this.side(player, seats), ago: 0 }
  }

  /** How many of each coin are left: drawn round the queen in the middle. Cleared when no game is on. */
  setCoins(left: { black: number; white: number; queen: number } | null) {
    const key = left ? `${left.black}/${left.white}/${left.queen}` : ''
    if (key === this.drawn) return
    this.drawn = key
    const g = this.coins
    g.clear()
    if (!left) return
    const cx = (this.tiles.w * TILE) / 2
    const cy = (this.tiles.h * TILE) / 2 - 1
    if (left.queen) g.rect(cx - 1, cy - 1, 3, 3).fill(COIN.queen)
    const ring = [[0, -4], [3, -3], [4, 0], [3, 3], [0, 4], [-3, 3], [-4, 0], [-3, -3], [0, -7], [6, -5], [7, 0], [6, 5], [0, 7], [-6, 5], [-7, 0], [-6, -5]]
    let b = left.black
    let w = left.white
    ring.forEach(([dx, dy], i) => {
      const colour = i % 2 === 0 ? (b > 0 ? 'black' : 'white') : w > 0 ? 'white' : 'black'
      if (colour === 'black' && b > 0) b--
      else if (colour === 'white' && w > 0) w--
      else return
      g.rect(cx + dx!, cy + dy!, 2, 2).fill(COIN[colour])
    })
  }

  update(dtMs: number) {
    const s = this.striker
    s.clear()
    if (!this.flick) return
    this.flick.ago += dtMs
    const k = Math.min(1, this.flick.ago / 500)
    if (this.flick.ago > 700) {
      this.flick = null
      return
    }
    const cx = (this.tiles.w * TILE) / 2
    const cy = (this.tiles.h * TILE) / 2
    const x = this.flick.from.x + (cx - this.flick.from.x) * k
    const y = this.flick.from.y + (cy - this.flick.from.y) * k
    s.rect(x - 1, y - 1, 3, 3).fill(INK)
    s.rect(x, y, 1, 1).fill(0xf4f4f8)
  }
}
