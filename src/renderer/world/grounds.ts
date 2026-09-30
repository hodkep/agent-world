import { Graphics } from 'pixi.js'
import { type OfficeMap, TILE } from './office'
import { textPixels } from './pixelfont'

// The grounds around the office: a night-time campus with a garden behind the building, a street in
// front of it and a car park across the road. All drawn in code like the rest of the world.

/** How far the grounds reach past the building, in art pixels. */
export const GROUNDS = { west: 14 * TILE, east: 14 * TILE, north: 4 * TILE, south: 7 * TILE }
export const GRASS = 0x1e3326

type G = Graphics
const r = (g: G, x: number, y: number, w: number, h: number, c: number, a = 1) => g.rect(x, y, w, h).fill(a === 1 ? c : { color: c, alpha: a })
const INK = 0x14111c

function rng(seed: number) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32)
}

export const shade = (c: number, f: number) =>
  (Math.min(255, Math.round(((c >> 16) & 255) * f)) << 16) | (Math.min(255, Math.round(((c >> 8) & 255) * f)) << 8) | Math.min(255, Math.round((c & 255) * f))

/** A filled pixel ellipse, one row at a time, so its edge stays crisp at any zoom. */
function ellipse(g: G, cx: number, cy: number, rx: number, ry: number, c: number, a = 1) {
  for (let y = -ry; y <= ry; y++) {
    const hw = Math.round(rx * Math.sqrt(1 - (y / ry) ** 2))
    r(g, cx - hw, cy + y, hw * 2, 1, c, a)
  }
}

function tree(g: G, x: number, y: number, big = 1) {
  ellipse(g, x + 2, y + 10 * big, 9 * big, 4 * big, 0x000000, 0.28)
  r(g, x - 1, y + 2 * big, 3, 8 * big, 0x4a3020)
  g.circle(x, y, 10 * big).fill(0x1d4a2c)
  g.circle(x - 4 * big, y - 3 * big, 6 * big).fill(0x2a6a3c)
  g.circle(x + 4 * big, y - 2 * big, 5 * big).fill(0x245a34)
  g.circle(x - 1 * big, y - 6 * big, 3 * big).fill(0x3a8450)
}

function lamp(g: G, x: number, y: number) {
  for (let k = 4; k >= 1; k--) ellipse(g, x + 1, y + 8, k * 8, k * 4, 0xf6d27a, 0.04)
  r(g, x, y - 12, 2, 20, 0x2a2c33)
  r(g, x - 2, y - 14, 6, 3, 0xf6e2a0)
}

const FLOWERS = [0xe0507a, 0xf2c230, 0xf5f0e6, 0xb070e0, 0xff8a50]
function flowerbed(g: G, x: number, y: number, w: number, h: number, rand: () => number) {
  r(g, x, y, w, h, 0x3a2a20)
  r(g, x, y, w, 1, 0x4c3828)
  for (let i = 0; i < (w * h) / 26; i++) {
    const fx = x + 1 + Math.floor(rand() * (w - 3))
    const fy = y + 1 + Math.floor(rand() * (h - 3))
    r(g, fx, fy, 1, 2, 0x2f7a3c)
    r(g, fx, fy - 1, 2, 2, FLOWERS[Math.floor(rand() * FLOWERS.length)]!)
  }
}

export function car(g: G, x: number, y: number, color: number, o: { vertical?: boolean; dir?: 1 | -1; lights?: boolean } = {}) {
  const { vertical = false, dir = 1, lights = false } = o
  const w = vertical ? 12 : 26
  const h = vertical ? 26 : 12
  r(g, x, y, w, h, INK)
  r(g, x + 1, y + 1, w - 2, h - 2, color)
  const roof = shade(color, 0.78)
  const glass = 0x8ec4dc
  if (vertical) {
    r(g, x + 2, y + 7, 8, 12, roof)
    r(g, x + 3, y + (dir === 1 ? 19 : 4), 6, 2, glass)
    r(g, x + 3, y + (dir === 1 ? 5 : 19), 6, 2, shade(glass, 0.7))
    r(g, x + 1, y + (dir === 1 ? h - 2 : 1), 3, 1, 0xffe9a0)
    r(g, x + w - 4, y + (dir === 1 ? h - 2 : 1), 3, 1, 0xffe9a0)
    r(g, x + 1, y + (dir === 1 ? 1 : h - 2), 3, 1, 0xd83a3a)
    r(g, x + w - 4, y + (dir === 1 ? 1 : h - 2), 3, 1, 0xd83a3a)
  } else {
    r(g, x + 7, y + 2, 12, 8, roof)
    r(g, x + (dir === 1 ? 19 : 5), y + 3, 2, 6, glass)
    r(g, x + (dir === 1 ? 5 : 19), y + 3, 2, 6, shade(glass, 0.7))
    const fx = dir === 1 ? x + w - 2 : x + 1
    const bx = dir === 1 ? x + 1 : x + w - 2
    r(g, fx, y + 1, 1, 3, 0xffe9a0)
    r(g, fx, y + h - 4, 1, 3, 0xffe9a0)
    r(g, bx, y + 1, 1, 3, 0xd83a3a)
    r(g, bx, y + h - 4, 1, 3, 0xd83a3a)
    if (lights) for (let k = 1; k <= 3; k++) r(g, dir === 1 ? x + w : x - k * 8, y + 2 + k, k * 8, h - 4 - k * 2, 0xffe9a0, 0.07)
  }
}
export const CAR_COLORS = [0xc0392b, 0x2e86c1, 0xe0c040, 0x3a9a5a, 0xe8e8ee, 0x8e44ad, 0xe67e22, 0x4a5060]

/** Static scenery: lawn, hedges and the street in front. Returns the ground graphic. */
export function drawGrounds(map: OfficeMap): G {
  const g = new Graphics()
  const rand = rng(11)
  const W = map.w * TILE
  const H = map.h * TILE
  const x0 = -GROUNDS.west
  const x1 = W + GROUNDS.east
  const y0 = -GROUNDS.north
  const y1 = H + GROUNDS.south
  const w = x1 - x0

  // Lawn with mowing stripes and speckle.
  r(g, x0, y0, w, y1 - y0, GRASS)
  for (let y = y0; y < y1; y += 32) r(g, x0, y, w, 16, 0xffffff, 0.02)
  for (let i = 0; i < (w * (y1 - y0)) / 70; i++) r(g, x0 + Math.floor(rand() * w), y0 + Math.floor(rand() * (y1 - y0)), 1, 2, rand() < 0.5 ? 0x284434 : 0x172a1f)

  // Flower beds and a clipped hedge along the back wall.
  for (let x = 12; x < W - 12; x += 60) flowerbed(g, x, -12, 48, 9, rand)
  r(g, x0, -30, w, 8, 0x143a22)
  for (let x = x0; x < x1; x += 6) r(g, x, -32 + ((x / 6) % 2), 5, 9, (x / 6) % 3 ? 0x245a34 : 0x2a6a3c)

  // Street in front.
  const walkY = H + 8
  r(g, x0, walkY, w, 20, 0x5e626c)
  for (let x = x0; x < x1; x += 16) r(g, x, walkY, 1, 20, 0x4e525b)
  r(g, x0, walkY + 20, w, 2, 0x3a3d45)
  r(g, x0, walkY + 22, w, 40, 0x24262d)
  for (let x = x0; x < x1; x += 32) r(g, x, walkY + 41, 16, 2, 0xc8b858)
  for (let x = x0 + 40; x < x1; x += 160) r(g, x, walkY + 22, 3, 40, 0xe4e4ec, 0.55)
  const door = map.spots('E')
  if (door.length) r(g, door[0]!.x * TILE, H, door.length * TILE, 8, 0x6e727c)

  // Across the road: far pavement and a hedge.
  const far = walkY + 62
  r(g, x0, far, w, 2, 0x3a3d45)
  r(g, x0, far + 2, w, 14, 0x565a64)
  for (let x = x0; x < x1; x += 16) r(g, x, far + 2, 1, 14, 0x484c55)
  const hedgeY = far + 22
  r(g, x0, hedgeY, w, 14, 0x1d4a2c)
  for (let x = x0; x < x1; x += 6) r(g, x, hedgeY + ((x / 6) % 2), 5, 12, (x / 6) % 3 ? 0x245a34 : 0x2a6a3c)
  r(g, x0, hedgeY + 12, w, 2, 0x143a22)

  // Trees on the lawn at the sides and along the back.
  for (let x = x0 + 16; x < x1; x += 34) tree(g, x + Math.floor(rand() * 10), -42 + Math.floor(rand() * 8), 1 + rand() * 0.4)
  for (const [x, y] of [[x0 + 10, 40], [x0 + 24, 150], [x0 + 12, 230], [x1 - 14, 60], [x1 - 22, 170], [x1 - 12, 240]] as const) tree(g, x, y, 1.1)
  for (let x = 20; x < W; x += 136) lamp(g, x, walkY - 4)
  for (let x = x0 + 60; x < x1; x += 120) lamp(g, x, far + 2)
  return g
}

// ---- moving life --------------------------------------------------------------------------

interface Vehicle {
  x: number
  lane: 0 | 1
  speed: number
  color: number
}
interface Walker {
  x: number
  dir: 1 | -1
  speed: number
  shirt: number
  hair: number
}

/** How many cars are on the road for a given number of busy agents: an idle office is a quiet street. */
export const carsFor = (busy: number) => 1 + Math.min(7, busy * 2)

/** Traffic and pedestrians, redrawn every frame into one Graphics. The street gets busier as agents work. */
export class Street {
  readonly view = new Graphics()
  private readonly rand = rng(29)
  private readonly cars: Vehicle[] = []
  private readonly walkers: Walker[] = []
  private readonly left: number
  private readonly right: number
  private readonly roadY: number
  private wanted = carsFor(0)

  constructor(private readonly map: OfficeMap) {
    this.left = -GROUNDS.west - 40
    this.right = map.w * TILE + GROUNDS.east + 40
    this.roadY = map.h * TILE + 8 + 22
    for (let i = 0; i < 3; i++) this.walkers.push(this.newWalker(this.left + this.rand() * (this.right - this.left)))
  }

  /** Busy agents drive the traffic; cars are added at the edge and leave when their road is clear of the excess. */
  setBusy(busy: number) {
    this.wanted = carsFor(busy)
  }

  private newCar(x: number): Vehicle {
    const lane = this.rand() < 0.5 ? 0 : 1
    return { x, lane, speed: (0.03 + this.rand() * 0.03) * (lane ? -1 : 1), color: CAR_COLORS[Math.floor(this.rand() * CAR_COLORS.length)]! }
  }

  private newWalker(x: number): Walker {
    const dir = this.rand() < 0.5 ? 1 : -1
    return { x, dir, speed: 0.012 + this.rand() * 0.01, shirt: CAR_COLORS[Math.floor(this.rand() * CAR_COLORS.length)]!, hair: [0x2a1c14, 0x6a4020, 0xd8b060, 0x1a1a22][Math.floor(this.rand() * 4)]! }
  }

  update(dt: number, t: number) {
    const g = this.view
    g.clear()
    // Add a car at a road end when there are too few; retire one that has left the screen when there are too many.
    if (this.cars.length < this.wanted) {
      const c = this.newCar(0)
      c.x = c.speed > 0 ? this.left - 30 : this.right
      this.cars.push(c)
    }
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i]!
      c.x += c.speed * dt
      const gone = c.speed > 0 ? c.x > this.right : c.x < this.left - 30
      if (!gone) continue
      if (this.cars.length > this.wanted) this.cars.splice(i, 1)
      else c.x = c.speed > 0 ? this.left - 30 : this.right
    }
    for (const c of this.cars) car(g, Math.round(c.x), this.roadY + (c.lane ? 22 : 4), c.color, { dir: c.lane ? -1 : 1, lights: true })
    const walkY = this.map.h * TILE + 8
    for (const w of this.walkers) {
      w.x += w.speed * w.dir * dt
      if (w.x > this.right) w.x = this.left
      if (w.x < this.left) w.x = this.right
      const x = Math.round(w.x)
      const step = Math.floor(t / 220 + w.x / 9) % 2
      const y = walkY + 5
      r(g, x - 3, y + 11, 8, 2, 0x000000, 0.25)
      r(g, x - 1, y + 8, 2, 4 + step, INK)
      r(g, x + 2, y + 8, 2, 5 - step, INK)
      r(g, x - 2, y + 2, 7, 7, INK)
      r(g, x - 1, y + 3, 5, 5, w.shirt)
      r(g, x - 1, y - 3, 5, 5, INK)
      r(g, x, y - 2, 3, 3, 0xe8b890)
      r(g, x, y - 3, 3, 1, w.hair)
    }
  }
}

/** A sandwich board on the pavement by the door, shown while the office is empty. */
export function drawHiringSign(map: OfficeMap): G {
  const g = new Graphics()
  const door = map.spots('E')[0]
  const x = (door ? door.x * TILE : map.w * TILE / 2) - 68
  const y = map.h * TILE + 4
  ellipse(g, x + 28, y + 25, 30, 4, 0x000000, 0.3)
  r(g, x + 5, y + 20, 3, 6, INK)
  r(g, x + 48, y + 20, 3, 6, INK)
  r(g, x, y, 56, 22, INK)
  r(g, x + 1, y + 1, 54, 20, 0xf6e8b8)
  r(g, x + 1, y + 1, 54, 4, 0xd83a3a)
  const put = (text: string, ty: number, color: number) => {
    const rows = textPixels(text)
    const ox = x + Math.floor((56 - rows[0]!.length) / 2)
    rows.forEach((row, ry) => [...row].forEach((c, rx) => c === '#' && r(g, ox + rx, ty + ry, 1, 1, color)))
  }
  put('WE ARE', y + 7, INK)
  put('HIRING', y + 14, 0xb03030)
  for (const lx of [x + 4, x + 50]) r(g, lx, y - 2, 2, 2, 0xf6d27a)
  return g
}
