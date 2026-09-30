import { Graphics } from 'pixi.js'
import { type OfficeMap, TILE } from './office'
import { textPixels } from './pixelfont'

// The grounds around the office: a night-time campus with a garden behind the building, a street in
// front of it and a car park across the road. All drawn in code like the rest of the world.

/** How far the grounds reach past the building, in art pixels. */
export const GROUNDS = { west: 14 * TILE, east: 14 * TILE, north: 10 * TILE, south: 12 * TILE }
export const GRASS = 0x1e3326
// Placed so the whole garden shows at the default zoom, just above the building.
const PLAZA_Y = -122

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

function bench(g: G, x: number, y: number, w = 22) {
  r(g, x, y, w, 7, INK)
  r(g, x + 1, y + 1, w - 2, 2, 0x9a6a40)
  r(g, x + 1, y + 3, w - 2, 2, 0x8e5b34)
  r(g, x + 2, y + 7, 2, 3, INK)
  r(g, x + w - 4, y + 7, 2, 3, INK)
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

function car(g: G, x: number, y: number, color: number, o: { vertical?: boolean; dir?: 1 | -1; lights?: boolean } = {}) {
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
const CAR_COLORS = [0xc0392b, 0x2e86c1, 0xe0c040, 0x3a9a5a, 0xe8e8ee, 0x8e44ad, 0xe67e22, 0x4a5060]

/** Static scenery. Returns the ground graphic, drawn under the building. */
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

  // ---- street in front ----
  const walkY = H + 8
  r(g, x0, walkY, w, 20, 0x5e626c)
  for (let x = x0; x < x1; x += 16) r(g, x, walkY, 1, 20, 0x4e525b)
  r(g, x0, walkY + 20, w, 2, 0x3a3d45)
  r(g, x0, walkY + 22, w, 40, 0x24262d)
  for (let x = x0; x < x1; x += 32) r(g, x, walkY + 41, 16, 2, 0xc8b858)
  for (let x = x0 + 40; x < x1; x += 160) r(g, x, walkY + 22, 3, 40, 0xe4e4ec, 0.55) // zebra
  const door = map.spots('E')
  if (door.length) r(g, door[0]!.x * TILE, H, door.length * TILE, 8, 0x6e727c)

  // ---- across the road: far pavement, car park, hedge ----
  const far = walkY + 62
  r(g, x0, far, w, 2, 0x3a3d45)
  r(g, x0, far + 2, w, 14, 0x565a64)
  for (let x = x0; x < x1; x += 16) r(g, x, far + 2, 1, 14, 0x484c55)
  const lot = far + 16
  r(g, x0 + 32, lot, w - 64, 76, 0x2a2c34)
  r(g, x0 + 32, lot, w - 64, 1, 0x3a3d45)
  for (let x = x0 + 32; x <= x1 - 32; x += 30) r(g, x, lot + 2, 1, 36, 0xd8d8e0, 0.7)
  for (let x = x0 + 40; x < x1 - 40; x += 24) r(g, x, lot + 58, 12, 1, 0xd8d8e0, 0.5)
  // A few parked cars, some bays empty, one charging.
  for (let bay = 0, x = x0 + 32; x < x1 - 60; bay++, x += 30) {
    if (rand() < 0.38) continue
    car(g, x + 9, lot + 6, CAR_COLORS[Math.floor(rand() * CAR_COLORS.length)]!, { vertical: true, dir: -1 })
  }
  const hedgeY = lot + 76
  r(g, x0 + 32, hedgeY, w - 64, 14, 0x1d4a2c)
  for (let x = x0 + 32; x < x1 - 32; x += 6) r(g, x, hedgeY + ((x / 6) % 2), 5, 12, (x / 6) % 3 ? 0x245a34 : 0x2a6a3c)
  r(g, x0 + 32, hedgeY + 12, w - 64, 2, 0x143a22)
  // Bus shelter on the far pavement.
  const sx = x0 + 96
  r(g, sx, far + 1, 40, 18, INK)
  r(g, sx + 1, far + 2, 38, 3, 0x6a7a8a)
  r(g, sx + 2, far + 5, 36, 10, 0x9ac8d8, 0.55)
  r(g, sx + 6, far + 14, 26, 3, 0x9a6a40)

  // ---- garden behind the building ----
  const plazaX = W / 2 - 64
  const plazaY = PLAZA_Y
  // Flower beds along the back wall, hedge corners.
  for (let x = 12; x < W - 12; x += 60) flowerbed(g, x, -12, 48, 9, rand)
  // Plaza with a fountain, benches and lamps.
  r(g, plazaX - 2, plazaY - 2, 132, 84, INK)
  for (let y = 0; y < 80; y += 8) for (let x = 0; x < 128; x += 8) r(g, plazaX + x, plazaY + y, 8, 8, ((x + y) / 8) % 2 ? 0x767a86 : 0x828694)
  for (let y = 0; y <= 80; y += 8) r(g, plazaX, plazaY + y, 128, 1, 0x646874)
  const fx = plazaX + 64
  const fy = plazaY + 40
  ellipse(g, fx, fy + 3, 30, 17, 0x000000, 0.3)
  ellipse(g, fx, fy, 28, 17, INK)
  ellipse(g, fx, fy, 26, 15, 0x9aa0b0)
  ellipse(g, fx, fy, 22, 12, 0x4aa6c8)
  ellipse(g, fx, fy, 14, 7, 0x62bcdc)
  r(g, fx - 2, fy - 8, 5, 8, 0x9aa0b0)
  r(g, fx - 3, fy - 9, 7, 2, 0xc8ccd6)
  bench(g, plazaX + 6, plazaY + 66, 26)
  bench(g, plazaX + 96, plazaY + 66, 26)
  bench(g, plazaX + 6, plazaY + 6, 26)
  bench(g, plazaX + 96, plazaY + 6, 26)
  lamp(g, plazaX - 8, plazaY + 10)
  lamp(g, plazaX + 136, plazaY + 10)
  lamp(g, plazaX - 8, plazaY + 72)
  lamp(g, plazaX + 136, plazaY + 72)
  // Paths from the plaza to the two sides of the yard.
  for (const [px, pw] of [[x0 + 24, plazaX - x0 - 24], [plazaX + 130, x1 - 24 - plazaX - 130]] as const) {
    r(g, px, plazaY + 34, pw, 12, INK)
    r(g, px, plazaY + 35, pw, 10, 0x8a7a64)
    for (let x = px; x < px + pw; x += 6) r(g, x, plazaY + 35 + ((x / 6) % 3) * 3, 3, 2, 0x9c8c74)
  }

  // Pond with a dock, lily pads and reeds (west).
  const pcx = 20
  const pcy = -80
  ellipse(g, pcx, pcy, 62, 30, 0x3a2a20)
  ellipse(g, pcx, pcy, 58, 27, 0x2d6a86)
  ellipse(g, pcx - 8, pcy - 4, 44, 18, 0x3a86a6)
  for (let i = 0; i < 9; i++) {
    const lx = pcx - 40 + Math.floor(rand() * 80)
    const ly = pcy - 14 + Math.floor(rand() * 26)
    ellipse(g, lx, ly, 4, 2, 0x3f9a52)
    if (i % 3 === 0) r(g, lx, ly - 1, 2, 2, 0xf5b0c8)
  }
  for (let x = pcx - 56; x < pcx + 56; x += 9) {
    const yy = pcy + Math.round(27 * Math.sqrt(1 - ((x - pcx) / 58) ** 2)) + 1
    r(g, x, yy - 5, 1, 6, 0x4a8a3a)
    r(g, x + 2, yy - 3, 1, 4, 0x3a7a30)
  }
  r(g, pcx + 20, pcy + 8, 40, 8, INK)
  for (let x = 0; x < 40; x += 4) r(g, pcx + 20 + x, pcy + 9, 3, 6, (x / 4) % 2 ? 0x8e5b34 : 0x9c6840)

  // Picnic area with a parasol (east).
  const tx = W - 84
  const ty = -76
  ellipse(g, tx + 14, ty + 12, 26, 9, 0x000000, 0.25)
  bench(g, tx - 6, ty - 8, 40)
  bench(g, tx - 6, ty + 20, 40)
  r(g, tx - 2, ty, 32, 14, INK)
  r(g, tx - 1, ty + 1, 30, 12, 0xb27c48)
  for (let x = 0; x < 30; x += 6) r(g, tx - 1 + x, ty + 1, 1, 12, 0x8a5a33)
  r(g, tx + 6, ty + 3, 6, 5, 0xf0f0e6)
  r(g, tx + 16, ty + 5, 5, 4, 0xd83a3a)
  r(g, tx + 13, ty - 22, 2, 24, 0xd9d5c8)
  ellipse(g, tx + 14, ty - 24, 20, 9, INK)
  ellipse(g, tx + 14, ty - 24, 18, 7, 0xd94a4a)
  for (let x = -18; x < 18; x += 12) r(g, tx + 14 + x, ty - 30, 6, 12, 0xf0f0e6, 0.9)
  // Bike rack and a grill.
  for (let i = 0; i < 4; i++) r(g, W - 60 + i * 8, -34, 2, 8, 0x9aa0ae)
  r(g, W - 62, -28, 36, 2, 0x9aa0ae)
  r(g, W - 22, -62, 14, 10, INK)
  r(g, W - 21, -61, 12, 5, 0x3a3f4d)
  r(g, W - 19, -59, 3, 2, 0xe0703a)

  // ---- side yards ----
  // West: greenhouse and vegetable beds.
  const gx = -60 - 92
  const gy = 40
  r(g, gx, gy, 92, 56, INK)
  r(g, gx + 2, gy + 2, 88, 52, 0x9cd8e0, 0.32)
  for (let x = 0; x <= 88; x += 22) r(g, gx + 2 + x, gy + 2, 1, 52, 0xd8eef2, 0.6)
  for (let y = 8; y < 52; y += 14) r(g, gx + 2, gy + y, 88, 1, 0xd8eef2, 0.45)
  for (let i = 0; i < 12; i++) r(g, gx + 8 + (i % 6) * 14, gy + 14 + Math.floor(i / 6) * 22, 5, 5, [0x3f9a52, 0xd83a3a, 0x5abe68][i % 3]!)
  for (let row = 0; row < 3; row++) {
    const by = gy + 72 + row * 14
    r(g, gx, by, 92, 9, 0x3a2a20)
    for (let x = 4; x < 90; x += 6) {
      r(g, gx + x, by - 2, 2, 5, 0x3f9a52)
      r(g, gx + x + 1, by - 3, 2, 2, [0x5abe68, 0xd8a040, 0x3f9a52][row]!)
    }
  }
  // East: a small basketball court.
  const cx = W + 72
  const cy = 60
  r(g, cx - 2, cy - 2, 132, 84, INK)
  r(g, cx, cy, 128, 80, 0x8c4a2a)
  for (let y = 0; y < 80; y += 8) r(g, cx, cy + y, 128, 1, 0x7c3e22)
  r(g, cx + 4, cy + 4, 120, 72, 0x000000, 0)
  const line = (x: number, y: number, ww: number, hh: number) => r(g, cx + x, cy + y, ww, hh, 0xe8e0d0, 0.9)
  line(3, 3, 122, 1); line(3, 76, 122, 1); line(3, 3, 1, 74); line(124, 3, 1, 74); line(63, 3, 1, 74)
  line(3, 22, 26, 1); line(3, 56, 26, 1); line(28, 22, 1, 35)
  line(99, 22, 26, 1); line(99, 56, 26, 1); line(99, 22, 1, 35)
  ellipse(g, cx + 64, cy + 40, 9, 9, 0xe8e0d0, 0.0)
  for (const hx of [cx - 5, cx + 128]) {
    r(g, hx, cy + 32, 2, 16, INK)
    r(g, hx + (hx < cx ? -2 : 2), cy + 36, 2, 8, 0xd8d8e0)
  }
  r(g, cx + 60, cy + 36, 8, 8, 0xe0703a)

  // ---- trees, lamps and edges ----
  for (let x = x0 + 20; x < x1; x += 26) {
    const ty2 = y0 + 8 + Math.floor(rand() * 26)
    if (x > plazaX - 20 && x < plazaX + 150 && false) continue
    tree(g, x + Math.floor(rand() * 8), ty2, 1 + rand() * 0.4)
  }
  for (const [x, y] of [[x0 + 8, 30], [x0 + 12, 130], [x0 + 8, 210], [x1 - 14, 190], [x1 - 10, 40], [x1 - 14, 240], [x0 + 150, 20], [x1 - 160, 24], [x0 + 6, 265]] as const) tree(g, x, y, 1.1)
  for (let x = 20; x < W; x += 136) lamp(g, x, walkY - 4)
  for (let x = x0 + 60; x < x1; x += 120) lamp(g, x, far + 2)
  for (let i = 0; i < 40; i++) {
    const sx2 = x0 + 8 + Math.floor(rand() * (w - 16))
    const sy2 = y0 + 8 + Math.floor(rand() * (H + GROUNDS.north - 24))
    if ((sx2 > -6 && sx2 < W + 6 && sy2 > -14 && sy2 < H + 14) || (sy2 > walkY - 6)) continue
    r(g, sx2, sy2, 3, 2, 0x5a5e68)
    r(g, sx2, sy2, 3, 1, 0x767a86)
  }
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
interface Firefly {
  x: number
  y: number
  phase: number
}

/** Cars, pedestrians, fountain spray and fireflies; redrawn every frame into one Graphics. */
export class Street {
  readonly view = new Graphics()
  private readonly rand = rng(29)
  private readonly cars: Vehicle[] = []
  private readonly walkers: Walker[] = []
  private readonly flies: Firefly[] = []
  private readonly left: number
  private readonly right: number
  private readonly roadY: number
  private readonly plazaX: number

  constructor(private readonly map: OfficeMap) {
    this.left = -GROUNDS.west - 40
    this.right = map.w * TILE + GROUNDS.east + 40
    this.roadY = map.h * TILE + 8 + 22
    this.plazaX = (map.w * TILE) / 2 - 64
    const span = this.right - this.left
    for (let i = 0; i < 5; i++) this.cars.push(this.newCar(this.left + (span / 5) * i + this.rand() * 60))
    for (let i = 0; i < 3; i++) this.walkers.push(this.newWalker(this.left + this.rand() * span))
    for (let i = 0; i < 16; i++) this.flies.push({ x: -30 + this.rand() * 130, y: -110 + this.rand() * 60, phase: this.rand() * 6 })
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
    const span = this.right - this.left
    for (const c of this.cars) {
      c.x += c.speed * dt
      if (c.speed > 0 && c.x > this.right) Object.assign(c, this.newCar(this.left - 30), { lane: 0, speed: Math.abs(c.speed) })
      if (c.speed < 0 && c.x < this.left - 30) Object.assign(c, this.newCar(this.right), { lane: 1, speed: -Math.abs(c.speed) })
      car(g, Math.round(c.x), this.roadY + (c.lane ? 22 : 4), c.color, { dir: c.lane ? -1 : 1, lights: true })
    }
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
    // Fountain spray: a few drops arcing up and out of the centre column.
    const fx = this.plazaX + 64
    const fy = PLAZA_Y + 40
    for (let i = 0; i < 8; i++) {
      const p = ((t / 900 + i / 8) % 1)
      const dx = Math.round((i - 3.5) * 3.2 * p)
      const dy = Math.round(-14 * Math.sin(p * Math.PI) - 8 + p * 12)
      r(g, fx + dx, fy + dy, 1, 2, 0xdff4ff, 0.85 * (1 - p * 0.5))
    }
    for (let k = 0; k < 3; k++) {
      const p = ((t / 1400 + k / 3) % 1)
      const rx = Math.round(6 + p * 16)
      const ry = Math.round(3 + p * 8)
      for (let a = 0; a < 28; a++) {
        const th = (a / 28) * Math.PI * 2
        r(g, fx + Math.round(Math.cos(th) * rx), fy + 2 + Math.round(Math.sin(th) * ry), 1, 1, 0xdff4ff, 0.5 * (1 - p))
      }
    }
    // Fireflies over the pond.
    for (const f of this.flies) {
      const x = f.x + Math.sin(t / 1300 + f.phase) * 10
      const y = f.y + Math.cos(t / 1700 + f.phase * 2) * 6
      const glow = 0.35 + 0.65 * Math.max(0, Math.sin(t / 500 + f.phase * 3))
      r(g, Math.round(x) - 1, Math.round(y) - 1, 3, 3, 0xd8f070, 0.12 * glow)
      r(g, Math.round(x), Math.round(y), 1, 1, 0xf2ff90, glow)
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
