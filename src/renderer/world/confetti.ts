import { Graphics } from 'pixi.js'

const COLOURS = [0xf2c230, 0xe04040, 0x40a0e0, 0x50e070, 0xe070d0, 0xf4f4f8]

interface Bit {
  x: number
  y: number
  vx: number
  vy: number
  colour: number
  left: number
}

/** Bits of paper thrown up over an agent that has finished, falling back with a little drift; drawn only while there are some. */
export class Confetti {
  readonly view = new Graphics()
  private bits: Bit[] = []

  get count() {
    return this.bits.length
  }

  burst(x: number, y: number, n: number, rand: () => number = Math.random) {
    for (let i = 0; i < n; i++)
      this.bits.push({ x, y, vx: (rand() - 0.5) * 70, vy: -30 - rand() * 60, colour: COLOURS[Math.floor(rand() * COLOURS.length)]!, left: 1400 + rand() * 600 })
  }

  update(dtMs: number) {
    if (!this.bits.length) {
      if (this.view.visible) (this.view.clear(), (this.view.visible = false))
      return
    }
    this.view.visible = true
    const dt = dtMs / 1000
    for (const b of this.bits) {
      b.left -= dtMs
      b.vy += 120 * dt
      b.x += b.vx * dt
      b.y += b.vy * dt
    }
    this.bits = this.bits.filter((b) => b.left > 0)
    const g = this.view
    g.clear()
    for (const b of this.bits) g.rect(Math.round(b.x), Math.round(b.y), 2, 2).fill(b.colour)
  }
}
