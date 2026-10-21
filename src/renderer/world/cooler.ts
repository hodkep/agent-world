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

/** The coffee machine's tank on the counter: the dark window of the machine shows how much is left, brown for coffee and a red light when it is empty. */
export class CoffeeTank {
  readonly view = new Graphics()
  private shown = -1

  constructor(counterX: number, counterY: number) {
    this.view.x = counterX * TILE + 51
    this.view.y = counterY * TILE - 10
    this.view.zIndex = counterY * TILE + TILE + 4.5
  }

  set(level: number) {
    const cols = Math.round(Math.max(0, Math.min(1, level)) * 8)
    if (cols === this.shown) return
    this.shown = cols
    const g = this.view
    g.clear()
    g.rect(0, 0, 8, 3).fill(0x40404a)
    if (cols > 0) g.rect(0, 0, cols, 3).fill(0x8a5a2a)
    if (cols === 0) g.rect(7, 0, 1, 1).fill(0xe04040)
  }
}

/** The kitchen sink's tap while the office boy fills a jar: a spout reaching out over the counter, the stream, and a jar that fills; nothing is drawn otherwise. */
export class SinkFill {
  readonly view = new Graphics()
  private shown = -2

  constructor(counterX: number, counterY: number) {
    this.view.x = counterX * TILE
    this.view.y = counterY * TILE
    this.view.zIndex = counterY * TILE + TILE + 4.6
  }

  /** How full the jar is (0 to 1), or null for no jar and no tap running. Redrawn only when the water level changes by a row. */
  set(progress: number | null) {
    const rows = progress === null ? -1 : Math.round(Math.max(0, Math.min(1, progress)) * 8)
    if (rows === this.shown) return
    this.shown = rows
    const g = this.view
    g.clear()
    if (rows < 0) return
    // The spout, a neck down to the jar, the stream while it runs, and the jar on the counter with its water.
    g.rect(22, -13, 9, 4).fill(0x1a1522)
    g.rect(23, -12, 7, 2).fill(0xb8bcc8)
    g.rect(29, -11, 3, 3).fill(0x1a1522)
    g.rect(30, -10, 1, 1).fill(0xb8bcc8)
    g.rect(28, -10, 6, 11).fill(0x1a1522)
    g.rect(29, -9, 4, 9).fill(0xdbe8f4)
    if (rows > 0) g.rect(29, 0 - rows, 4, rows).fill(0x8ac4f0)
    if (rows < 8) g.rect(30, -9, 1, 8 - rows).fill(0x8ac4f0)
  }
}
