import { Graphics } from 'pixi.js'
import { TILE } from './office'

const LEVELS = 9

/** The water in the cooler's jar, drawn over the still picture of the cooler: the jar is the 6x9 inside of its blue box. */
export class CoolerJar {
  readonly view = new Graphics()
  private shown = -1

  constructor(tileX: number, tileY: number) {
    const px = tileX * TILE
    const py = tileY * TILE
    this.view.x = px + 5
    this.view.y = py - 11
    this.view.zIndex = py + TILE + 0.5
  }

  /** Draws the jar with `water` (0 to 1) in it, or the empty place where it stands while it is lifted out; only when what is drawn changes. */
  set(water: number, present = true) {
    const rows = present ? Math.round(Math.max(0, Math.min(1, water)) * LEVELS) : -2
    if (rows === this.shown) return
    this.shown = rows
    const g = this.view
    g.clear()
    if (rows === -2) {
      g.rect(0, 0, 6, LEVELS).fill(0x7a8499)
      return
    }
    g.rect(0, 0, 6, LEVELS).fill(0xdbe8f4)
    if (rows > 0) {
      g.rect(0, LEVELS - rows, 6, rows).fill(0x8ac4f0)
      g.rect(0, LEVELS - rows, 2, Math.max(0, rows - 1)).fill(0xb8dcf8)
    }
  }
}
