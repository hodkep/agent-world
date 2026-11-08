import { Container, Graphics } from 'pixi.js'
import type { GitKind } from './gitCourier'
import type { RampGeo, Shown } from './gitRamp'
import { RiderView } from './riders'

const INK = 0x14111c
const STEEL = 0xb4bccb
const STEEL_DARK = 0x6b7388
const r = (g: Graphics, x: number, y: number, w: number, h: number, c: number) => void g.rect(Math.round(x), Math.round(y), w, h).fill(c)
const framed = (g: Graphics, x: number, y: number, w: number, h: number, c: number) => (r(g, x - 1, y - 1, w + 2, h + 2, INK), r(g, x, y, w, h, c))

const GIT_ORANGE = 0xf05033

/** Git's mark on a plate in the wall: an orange diamond with a white branch (a line, two dots and a side dot), 13 pixels across, in an ink edge. */
function gitPlate(g: Graphics, x: number, y: number) {
  const cell = (dx: number, dy: number, c: number) => r(g, x + 6 + dx, y + 6 + dy, 1, 1, c)
  for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) if (Math.abs(dx) + Math.abs(dy) <= 6) cell(dx, dy, Math.abs(dx) + Math.abs(dy) <= 5 ? GIT_ORANGE : INK)
  for (let dy = -3; dy <= 3; dy++) cell(-1, dy, 0xffffff)
  for (const [dx, dy] of [[0, 0], [1, 0], [2, -1], [2, 0], [2, 1], [3, 0], [-2, -3], [0, -3], [-2, 3], [0, 3]] as const) cell(dx, dy, 0xffffff)
}

/** The three kinds of parcel, 8 to 10 pixels wide: a small box for a commit, a box with an arrow for a push, an envelope with a seal for a pull request. */
const PARCEL: Record<GitKind, [w: number, h: number, draw: (g: Graphics, x: number, y: number) => void]> = {
  commit: [8, 6, (g, x, y) => (framed(g, x, y, 8, 6, 0xc8923c), r(g, x + 3, y, 2, 6, 0xe9d9a8))],
  push: [9, 7, (g, x, y) => (framed(g, x, y, 9, 7, 0x3c8c6c), r(g, x + 4, y + 1, 1, 5, 0xe9fff2), r(g, x + 3, y + 2, 3, 1, 0xe9fff2), r(g, x + 2, y + 3, 5, 1, 0xe9fff2))],
  pr: [10, 7, (g, x, y) => (framed(g, x, y, 10, 7, 0xf1ecd9), r(g, x + 1, y + 1, 8, 1, 0xc9c2a8), r(g, x + 4, y + 3, 3, 3, 0xd83a3a), r(g, x + 5, y + 4, 1, 1, 0xffb0a0))]
}

/**
 * The hatch in the south wall, the chute, the crate at the kerb, the parcels and the git courier's scooter. The wall's part and the parcels still inside go on `inner` (above the floor, under the
 * lighting); the rest on `outer` and in the street's `riders`, under the scooter.
 */
export class RampView {
  readonly inner = new Graphics()
  readonly outer = new Graphics()
  private readonly bikes: RiderView[] = []

  constructor(
    private readonly geo: RampGeo,
    private readonly riders: Container
  ) {
    this.riders.addChild(this.outer)
  }

  draw(shown: Shown, t: number) {
    const { hatch, crate, wallY, laneY } = this.geo
    const { inner, outer } = this
    inner.clear()
    outer.clear()
    // The hatch: a steel frame in the wall with a dark opening.
    framed(inner, hatch.x - 8, wallY - 14, 16, 12, STEEL_DARK)
    r(inner, hatch.x - 6, wallY - 12, 12, 8, 0x2a2740)
    gitPlate(inner, hatch.x + 10, wallY - 15)
    // The chute, from the hatch down to the crate, a few steps of steel with a rail on each side.
    for (let i = 0; i < 4; i++) {
      const y = wallY + 1 + i * 5
      const x = hatch.x - 7 + ((crate.x - hatch.x + 6) * i) / 3
      r(outer, x - 1, y, 1, 6, INK)
      r(outer, x + 15, y, 1, 6, INK)
      r(outer, x, y, 15, 5, i % 2 ? STEEL : 0xc9d0dc)
    }
    // The crate at the kerb.
    framed(outer, crate.x - 2, crate.y + 2, 30, 10, 0x6a5a78)
    r(outer, crate.x, crate.y + 4, 26, 6, 0x2c2438)
    for (const p of shown.parcels) {
      const [w, h, paint] = PARCEL[p.kind]
      paint(p.y < wallY - 2 ? inner : outer, p.x - w / 2, p.y - h / 2)
    }
    shown.scooters.forEach((s, i) => {
      const view = (this.bikes[i] ??= this.addBike())
      view.view.visible = true
      view.update({ mode: s.mode, onScooter: true, scooter: { x: s.x, y: laneY }, rider: { x: s.x, y: laneY } }, t)
    })
    for (let i = shown.scooters.length; i < this.bikes.length; i++) this.bikes[i]!.view.visible = false
  }

  private addBike() {
    const v = new RiderView('git')
    this.riders.addChild(v.view)
    return v
  }
}
