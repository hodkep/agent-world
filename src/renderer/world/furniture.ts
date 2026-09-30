import { Container, Graphics } from 'pixi.js'
import type { Activity } from '../../shared/types'
import { type Furniture, type OfficeMap, TILE, type WallDecor } from './office'

// One palette for the whole building so every room reads as the same world.
const P = {
  ink: 0x14111c,
  wall: 0x2c3350,
  wallTop: 0x222840,
  wallTrim: 0x3c4568,
  base: 0x1c2135,
  woodA: 0x8e5b34,
  woodB: 0x87552f,
  woodC: 0x94613a,
  woodSeam: 0x6a4124,
  woodGrain: 0x9c6840,
  carpet: 0x4a6a96,
  carpetDot: 0x42608a,
  carpetLit: 0x5476a4,
  checkA: 0xe4e4ec,
  checkB: 0x26262f,
  srv: 0x3a3f4d,
  srvLine: 0x2c303b,
  desk: 0xb27c48,
  deskTop: 0xc68e57,
  deskEdge: 0x8a5a33,
  steel: 0x55586a,
  crt: 0xd9d5c8,
  crtShade: 0xb3ae9f,
  key: 0xeae6da,
  keyDot: 0xb0ab9c,
  sofa: 0xb03f5e,
  sofaDark: 0x8a2c48,
  sofaLit: 0xc8506f,
  leaf: 0x3f8f4f,
  leafDark: 0x2c6a3a,
  leafLit: 0x5aae62,
  pot: 0x9a6340,
  potDark: 0x74482c,
  metal: 0xc8ccd6,
  metalDark: 0x9aa0ae
}
const BOARD = 40
const BOOKS = [0xc0392b, 0x2e86c1, 0xf1c40f, 0x27ae60, 0x8e44ad, 0xecf0f1, 0xe67e22, 0x16a085, 0xd35400]

function rng(seed: number) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32)
}

type G = Graphics
const r = (g: G, x: number, y: number, w: number, h: number, c: number, a = 1) => g.rect(x, y, w, h).fill(a === 1 ? c : { color: c, alpha: a })
// Outlined block: the dark 1px rim is what makes every object read at 2-3x zoom.
const box = (g: G, x: number, y: number, w: number, h: number, fill: number) => {
  r(g, x, y, w, h, P.ink)
  r(g, x + 1, y + 1, w - 2, h - 2, fill)
}

// ---- floors & walls --------------------------------------------------------------------

export function drawFloors(map: OfficeMap): Graphics {
  const g = new Graphics()
  const rand = rng(11)
  for (let y = 0; y < map.h; y++)
    for (let x = 0; x < map.w; x++) {
      const t = map.at(x, y)
      const px = x * TILE
      const py = y * TILE
      const floor = t === 'X' || t === 'S' ? floorUnder(map, x, y) : t
      switch (floor) {
        case 'w':
        case 'E':
          for (let row = 0; row < 4; row++) {
            const course = y * 4 + row
            const shift = (course * 17) % BOARD
            for (let i = 0; i < TILE; ) {
              const gx = px + i + shift
              const board = Math.floor(gx / BOARD)
              const run = Math.min(TILE - i, BOARD - (gx % BOARD))
              r(g, px + i, py + row * 4, run, 3, [P.woodA, P.woodB, P.woodC][(board * 7 + course * 3) % 3]!)
              if (gx % BOARD === 0) r(g, px + i, py + row * 4, 1, 3, P.woodSeam)
              i += run
            }
            r(g, px, py + row * 4 + 3, TILE, 1, P.woodSeam)
            if (rand() < 0.2) r(g, px + Math.floor(rand() * 10) + 3, py + row * 4 + 1, 4, 1, P.woodGrain)
          }
          break
        case 'b':
          r(g, px, py, TILE, TILE, P.carpet)
          for (let i = 0; i < 7; i++) r(g, px + Math.floor(rand() * 16), py + Math.floor(rand() * 16), 1, 1, rand() < 0.5 ? P.carpetDot : P.carpetLit)
          break
        case 'k':
          for (let cy = 0; cy < 2; cy++) for (let cx = 0; cx < 2; cx++) r(g, px + cx * 8, py + cy * 8, 8, 8, (x * 2 + cx + y * 2 + cy) % 2 ? P.checkA : P.checkB)
          break
        case 'F':
          r(g, px, py, TILE, TILE, P.wall)
          if (map.at(x, y - 1) !== 'F') r(g, px, py, TILE, 3, P.wallTop)
          if (map.at(x, y + 1) !== 'F') {
            r(g, px, py + TILE - 4, TILE, 1, P.wallTrim)
            r(g, px, py + TILE - 3, TILE, 3, P.base)
          }
          break
        default:
          r(g, px, py, TILE, TILE, P.ink)
      }
    }
  // Room outlines: a thick dark rim wherever a floor meets a wall, like the reference's inked edges.
  for (let y = 0; y < map.h; y++)
    for (let x = 0; x < map.w; x++) {
      if (map.at(x, y) !== '#') continue
      const px = x * TILE
      const py = y * TILE
      const open = (dx: number, dy: number) => map.at(x + dx, y + dy) !== '#'
      if (open(1, 0)) r(g, px + TILE - 2, py, 2, TILE, 0x08070c)
      if (open(-1, 0)) r(g, px, py, 2, TILE, 0x08070c)
      if (open(0, -1)) r(g, px, py, TILE, 2, 0x08070c)
    }
  return g
}

function floorUnder(map: OfficeMap, x: number, y: number) {
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-2, 0], [2, 0], [0, 2], [0, -2]] as const) {
    const t = map.at(x + dx, y + dy)
    if ('wbk'.includes(t)) return t
  }
  return 'w'
}

// ---- screens -----------------------------------------------------------------------------

export class Screen {
  readonly g = new Graphics()
  constructor(
    private readonly x: number,
    private readonly y: number,
    private readonly w: number,
    private readonly h: number,
    z: number
  ) {
    this.g.zIndex = z
  }

  draw(activity: Activity | null, t: number) {
    const { g, x, y, w, h } = this
    g.clear()
    const tick = Math.floor(t / 150)
    const lines = (colors: number[], bg: number, speed: number) => {
      r(g, x, y, w, h, bg)
      const off = Math.floor(t / speed)
      for (let row = 0; row < h; row += 2) {
        const n = off + row
        const len = 2 + ((n * 7) % Math.max(1, w - 2))
        r(g, x + 1 + (n % 2), y + row, Math.min(len - (n % 2), w - 1), 1, colors[n % colors.length]!)
      }
    }
    switch (activity) {
      case null:
      case 'asleep':
        r(g, x, y, w, h, 0x0e1216)
        r(g, x + 1, y + 1, 2, 1, 0x1e262e)
        break
      case 'researching':
        lines([0x8890a0, 0x4a6ad0, 0xa0a8b8], 0xdfe4ec, 260)
        r(g, x, y, w, 1, 0x4a6ad0)
        break
      case 'implementing':
        lines([0xf07ab0, 0x6ad0e0, 0xe8d070, 0x80d080], 0x191a26, 170)
        break
      case 'running':
        lines([0x50e070, 0x2a9a40], 0x050a08, 70)
        break
      case 'delegating':
        r(g, x, y, w, h, 0x1e2838)
        r(g, x + Math.floor(w / 2) - 1, y + 1, 2, 2, 0xe8d070)
        r(g, x + 1, y + h - 2, 2, 1, 0x6ad0e0)
        r(g, x + w - 3, y + h - 2, 2, 1, 0x6ad0e0)
        break
      case 'permission':
        r(g, x, y, w, h, tick % 2 ? 0xd83a3a : 0xe0a030)
        r(g, x + Math.floor(w / 2), y + 1, 1, h - 3, 0xffffff)
        r(g, x + Math.floor(w / 2), y + h - 1, 1, 1, 0xffffff)
        break
      case 'thinking':
        r(g, x, y, w, h, 0x101820)
        if (tick % 4 < 2) r(g, x + 1, y + 1, 2, 1, 0xc0d0e0)
        break
      default:
        r(g, x, y, w, h, 0x12305a)
        r(g, x + (tick % Math.max(1, w - 1)), y + ((tick >> 2) % Math.max(1, h - 1)), 1, 1, 0x80c0ff)
    }
  }
}

// ---- furniture -----------------------------------------------------------------------------

interface Built {
  screens: Map<string, Screen>
  arcades: { x: number; y: number }[]
}

function place(layer: Container, z: number, draw: (g: G) => void) {
  const g = new Graphics()
  draw(g)
  g.zIndex = z
  layer.addChild(g)
}

function plantSprite(g: G, cx: number, base: number, rand: () => number, tall = true) {
  box(g, cx - 4, base - 7, 9, 7, P.pot)
  r(g, cx - 3, base - 6, 7, 1, P.potDark)
  const height = tall ? 16 : 10
  for (let i = 0; i < 9; i++) {
    const lx = cx - 5 + Math.floor(rand() * 10)
    const len = 4 + Math.floor(rand() * (height - 4))
    const col = [P.leaf, P.leafDark, P.leafLit][i % 3]!
    r(g, lx, base - 7 - len, 2, len, col)
    r(g, lx + (lx < cx ? -1 : 2), base - 7 - len, 1, 2, col)
  }
}

function drawPiece(f: Furniture, layer: Container, built: Built, rand: () => number, shadows: Graphics) {
  const px = f.x * TILE
  const py = f.y * TILE
  const w = f.w * TILE
  const h = f.h * TILE
  const bottom = py + h
  if (!f.kind.startsWith('chair')) shadows.rect(px + 1, bottom - 1, w - 2, 3).fill({ color: 0x000000, alpha: 0.22 })
  switch (f.kind) {
    case 'desk': {
      place(layer, bottom, (g) => {
        r(g, px + 3, py + 13, 2, 7, P.steel)
        r(g, px + w - 5, py + 13, 2, 7, P.steel)
        box(g, px + 1, py + 2, w - 2, 12, P.desk)
        r(g, px + 2, py + 3, w - 4, 1, P.deskTop)
        r(g, px + 2, py + 11, w - 4, 2, P.deskEdge)
        // CRT monitor, keyboard and mouse
        box(g, px + 9, py - 7, 14, 12, P.crt)
        r(g, px + 21, py - 6, 1, 10, P.crtShade)
        r(g, px + 10, py + 3, 12, 1, P.crtShade)
        r(g, px + 13, py + 5, 6, 2, P.crtShade)
        box(g, px + 9, py + 7, 13, 4, P.key)
        for (let k = 0; k < 5; k++) r(g, px + 11 + k * 2, py + 8, 1, 1, P.keyDot)
        box(g, px + 24, py + 7, 3, 4, P.key)
        // The left corner is left clear for the agent's growing pile of finished pages.
        if (rand() < 0.5) box(g, px + 27, py + 3, 3, 4, [0xe05050, 0x50a0e0, 0xf0f0f0, 0x60c070][Math.floor(rand() * 4)]!)
      })
      const s = new Screen(px + 11, py - 5, 10, 7, bottom + 1)
      built.screens.set(`${f.x},${f.y + 1}`, s)
      layer.addChild(s.g)
      break
    }
    case 'chair-desk':
      // Green stool, like the reference: drawn over the sitter so it reads as the seat under them.
      place(layer, py + TILE + 2, (g) => {
        r(g, px + 12, py + 12, 2, 4, P.steel)
        r(g, px + 18, py + 12, 2, 4, P.steel)
        box(g, px + 10, py + 7, 12, 6, 0x5f9e5f)
        r(g, px + 11, py + 8, 10, 1, 0x7fbe7a)
        r(g, px + 11, py + 11, 10, 1, 0x4a7e4a)
      })
      shadows.rect(px + 11, py + 15, 10, 1).fill({ color: 0x000000, alpha: 0.25 })
      break
    case 'chair-top':
      // Far-side chair: backrest behind the sitter, seat under them.
      place(layer, py, (g) => {
        box(g, px + 10, py - 2, 12, 9, 0x7a5236)
        r(g, px + 11, py - 1, 10, 1, 0x9a6c46)
        r(g, px + 12, py + 1, 8, 5, 0x6a4630)
        box(g, px + 9, py + 7, 14, 5, 0x8a5e3c)
        r(g, px + 10, py + 12, 2, 3, 0x5a3a26)
        r(g, px + 20, py + 12, 2, 3, 0x5a3a26)
      })
      break
    case 'chair-bottom':
      // Near-side chair: seat under the sitter, backrest in front of them.
      place(layer, py + TILE + 2, (g) => {
        r(g, px + 10, py + 13, 2, 3, 0x5a3a26)
        r(g, px + 20, py + 13, 2, 3, 0x5a3a26)
        box(g, px + 9, py + 4, 14, 5, 0x8a5e3c)
        box(g, px + 10, py + 7, 12, 8, 0x7a5236)
        r(g, px + 11, py + 8, 10, 1, 0x9a6c46)
      })
      shadows.rect(px + 10, py + 15, 12, 1).fill({ color: 0x000000, alpha: 0.25 })
      break
    case 'meeting': {
      place(layer, bottom, (g) => {
        r(g, px + 3, bottom - 3, 2, 4, P.deskEdge)
        r(g, px + w - 5, bottom - 3, 2, 4, P.deskEdge)
        box(g, px + 1, py + 1, w - 2, h - 3, 0xbf8a55)
        r(g, px + 2, py + 2, w - 4, 1, 0xd49c64)
        r(g, px + 2, bottom - 5, w - 4, 2, P.deskEdge)
        // laptop lids for the far side
        for (let i = 0; i < 3; i++) {
          const lx = px + 8 + i * 32
          box(g, lx + 2, py + 3, 12, 6, 0x8e94a2)
          r(g, lx + 7, py + 5, 2, 2, 0xdfe4ec)
        }
      })
      for (let i = 0; i < 3; i++) {
        const lx = px + 8 + i * 32
        place(layer, bottom + 1, (g) => {
          box(g, lx + 1, py + 15, 14, 3, 0x9aa0ae)
          box(g, lx + 2, py + 10, 12, 6, 0x2a2e38)
        })
        const s = new Screen(lx + 3, py + 11, 10, 4, bottom + 2)
        built.screens.set(`${f.x + i * 2},${f.y + f.h}`, s)
        layer.addChild(s.g)
      }
      break
    }
    case 'sofa-top':
      place(layer, py, (g) => {
        box(g, px, py - 5, w, 10, P.sofaDark)
        r(g, px + 1, py - 4, w - 2, 2, P.sofa)
        box(g, px, py + 3, w, 11, P.sofa)
        for (let i = 1; i < f.w; i++) r(g, px + i * TILE, py + 4, 1, 8, P.sofaDark)
        r(g, px + 1, py + 4, w - 2, 1, P.sofaLit)
        box(g, px - 2, py - 1, 5, 14, P.sofaDark)
        box(g, px + w - 3, py - 1, 5, 14, P.sofaDark)
        r(g, px + 1, py + 14, 2, 2, P.ink)
        r(g, px + w - 3, py + 14, 2, 2, P.ink)
      })
      break
    case 'sofa-bottom':
      place(layer, py + TILE + 3, (g) => {
        box(g, px, py + 3, w, 9, P.sofa)
        box(g, px, py + 9, w, 8, P.sofaDark)
        r(g, px + 1, py + 10, w - 2, 1, P.sofaLit)
        box(g, px - 2, py + 2, 5, 14, P.sofaDark)
        box(g, px + w - 3, py + 2, 5, 14, P.sofaDark)
      })
      break
    case 'coffee-table':
      place(layer, bottom, (g) => {
        box(g, px + 1, py + 2, w - 2, 11, 0xc8955a)
        r(g, px + 2, py + 3, w - 4, 1, 0xdcaa6c)
        r(g, px + 3, py + 13, 2, 3, P.deskEdge)
        r(g, px + w - 5, py + 13, 2, 3, P.deskEdge)
        box(g, px + 8, py + 4, 4, 5, 0xf0f0f0)
        r(g, px + 12, py + 5, 1, 2, 0xf0f0f0)
        box(g, px + 17, py + 5, 9, 6, 0x4a8ad0)
        r(g, px + 18, py + 6, 5, 1, 0xf0f0f0)
      })
      break
    case 'counter':
      place(layer, py + TILE + 4, (g) => {
        box(g, px, py - 2, w, 6, 0xdcdce4)
        box(g, px, py + 3, w, 13, 0x5a6478)
        for (let i = 0; i < f.w; i++) {
          r(g, px + i * TILE + 2, py + 5, 12, 9, 0x6a7488)
          r(g, px + i * TILE + 12, py + 8, 1, 3, P.metal)
        }
        // sink, coffee machine, microwave
        box(g, px + 18, py - 1, 12, 4, 0x9aa0ae)
        r(g, px + 23, py - 5, 2, 4, P.metal)
        box(g, px + 49, py - 12, 12, 14, 0x2a2a32)
        r(g, px + 51, py - 10, 8, 3, 0x40404a)
        r(g, px + 58, py - 10, 1, 1, 0xe04040)
        box(g, px + 53, py - 3, 4, 4, 0xf4f4f4)
        box(g, px + 66, py - 10, 20, 11, 0xe8e8f0)
        r(g, px + 68, py - 8, 12, 7, 0x2a3440)
        r(g, px + 82, py - 8, 2, 2, 0x50e070)
      })
      break
    case 'fridge':
      place(layer, bottom, (g) => {
        box(g, px + 1, py - 10, TILE - 2, h + 10, 0xe8ecf2)
        r(g, px + 2, py + 6, TILE - 4, 1, P.metalDark)
        r(g, px + TILE - 4, py - 4, 1, 6, P.metalDark)
        r(g, px + TILE - 4, py + 9, 1, 8, P.metalDark)
        r(g, px + 4, py - 5, 3, 3, 0xe05050)
        r(g, px + 8, py - 2, 3, 3, 0xf0c030)
      })
      break
    case 'bistro':
      place(layer, bottom, (g) => {
        r(g, px + 7, py + 8, 2, 7, P.steel)
        box(g, px + 1, py + 2, 14, 8, 0xe8e8f0)
        r(g, px + 3, py + 13, 10, 2, P.steel)
        box(g, px + 6, py - 2, 4, 5, 0x5a9ad0)
        r(g, px + 7, py - 5, 2, 3, P.leaf)
      })
      break
    case 'plant':
      place(layer, bottom, (g) => plantSprite(g, px + 8, bottom - 1, rand))
      break
    case 'beanbag': {
      // Drawn in front of the sitter: the bag swallows their lower half.
      const [fill, dark, lit] = ([[0xe07a3a, 0xb05a24, 0xf09a5a], [0x3aa0a0, 0x247a7a, 0x5ac0c0], [0x8a5ab0, 0x6a3a90, 0xaa7ad0]] as const)[f.x % 3]!
      place(layer, py + TILE + 3, (g) => {
        g.ellipse(px + 8, py + 12, 8, 5).fill(P.ink)
        g.ellipse(px + 8, py + 12, 7, 4).fill(fill)
        g.ellipse(px + 8, py + 14, 6, 2).fill(dark)
        r(g, px + 4, py + 9, 5, 1, lit)
      })
      break
    }
    case 'arcade':
      place(layer, bottom, (g) => {
        box(g, px + 1, py - 14, TILE - 2, 30, 0x2a2140)
        r(g, px + 2, py - 13, TILE - 4, 4, 0xe05090)
        r(g, px + 3, py - 12, TILE - 6, 2, 0xf6e27a)
        box(g, px + 2, py - 8, TILE - 4, 9, 0x0c0c16)
        r(g, px + 3, py + 3, TILE - 6, 3, 0x3a3060)
        r(g, px + 5, py + 4, 2, 1, 0xe04040)
        r(g, px + 9, py + 4, 2, 1, 0x40c0e0)
      })
      built.arcades.push({ x: px + 3, y: py - 7 })
      break
    case 'cooler':
      place(layer, bottom, (g) => {
        box(g, px + 3, py - 2, 10, 17, 0xe8ecf2)
        box(g, px + 4, py - 12, 8, 11, 0x8ac4f0)
        r(g, px + 5, py - 10, 2, 7, 0xb8dcf8)
        r(g, px + 7, py + 5, 2, 2, 0x3a70c0)
      })
      break
    case 'printer':
      place(layer, bottom, (g) => {
        box(g, px + 3, py + 4, w - 6, 11, 0x3a3f52)
        box(g, px + 5, py - 3, w - 10, 9, 0xd0d4dc)
        r(g, px + 8, py - 5, w - 16, 3, 0xf4f4f4)
        r(g, px + w - 10, py, 3, 1, 0x50e070)
      })
      break
    case 'bin':
      place(layer, bottom, (g) => {
        box(g, px + 4, py + 5, 8, 10, 0xb8bcc8)
        r(g, px + 5, py + 6, 6, 1, 0xdcdfe6)
        r(g, px + 6, py + 3, 3, 2, 0xf4f4f0)
      })
      break
  }
}

function drawDecor(d: WallDecor, layer: Container, rand: () => number) {
  const px = d.x * TILE
  const py = d.y * TILE
  const z = (d.y + 1) * TILE - 1
  place(layer, z, (g) => {
    switch (d.kind) {
      case 'shelf': {
        const w = d.w * TILE
        box(g, px + 1, py + 6, w - 2, 24, 0x7a4a2a)
        for (let shelf = 0; shelf < 2; shelf++) {
          const sy = py + 8 + shelf * 11
          r(g, px + 2, sy, w - 4, 9, 0x4a2c18)
          let bx = px + 3
          while (bx < px + w - 4) {
            const bw = 1 + Math.floor(rand() * 2)
            const bh = 5 + Math.floor(rand() * 4)
            r(g, bx, sy + 9 - bh, bw, bh, BOOKS[Math.floor(rand() * BOOKS.length)]!)
            bx += bw + (rand() < 0.15 ? 2 : 0)
          }
          r(g, px + 2, sy + 9, w - 4, 1, 0x9a6a40)
        }
        break
      }
      case 'kanban': {
        // The board is live: the world draws each agent's tasks and plan steps onto it.
        const w = d.w * TILE
        box(g, px + 2, py + 5, w - 4, 22, 0xa8b0c2)
        r(g, px + 3, py + 6, w - 6, 20, 0xf2f4f8)
        const cols = [0xe05050, 0xe0b030, 0x40b060]
        const colW = Math.floor((w - 8) / 3)
        for (let c = 0; c < 3; c++) r(g, px + 5 + c * colW, py + 8, colW - 3, 1, cols[c]!)
        r(g, px + w - 12, py + 27, 8, 2, 0x707888)
        break
      }
      case 'clock':
        break
      case 'vine': {
        box(g, px + 4, py + 3, 9, 6, P.pot)
        for (let i = 0; i < 7; i++) {
          const vx = px + 2 + Math.floor(rand() * 12)
          const len = 6 + Math.floor(rand() * 16)
          const col = [P.leaf, P.leafDark, P.leafLit][i % 3]!
          r(g, vx, py + 8, 1, len, col)
          for (let k = 2; k < len; k += 3) r(g, vx + (k % 2 ? 1 : -1), py + 8 + k, 2, 2, col)
        }
        break
      }
      case 'frame': {
        const w = d.w * TILE
        box(g, px + 2, py + 3, w - 4, 11, 0xc49a52)
        r(g, px + 4, py + 5, w - 8, 7, [0x6ab0e0, 0x2a2238, 0xe8d8b8][d.variant ?? 0]!)
        if (d.variant === 0) {
          r(g, px + 4, py + 9, w - 8, 3, 0x4a9a50)
          r(g, px + 9, py + 6, 2, 2, 0xf8e070)
        } else if (d.variant === 1) {
          for (let i = 0; i < 6; i++) r(g, px + 5 + Math.floor(rand() * (w - 12)), py + 6 + Math.floor(rand() * 4), 3, 2, [0xe06040, 0xf0c040, 0x60a0e0][i % 3]!)
        } else {
          r(g, px + 6, py + 6, 4, 3, 0xd0a080)
          r(g, px + 5, py + 9, 6, 3, 0x3a5a9a)
        }
        break
      }
      case 'tv': {
        // Wall TV over the lounge; its picture is animated in the ambient pass.
        const w = d.w * TILE
        box(g, px + 2, py + 3, w - 4, 24, 0x1a1a22)
        r(g, px + w / 2 - 3, py + 27, 6, 2, 0x2a2a32)
        break
      }
      case 'wallplant':
        plantSprite(g, px + 8, py + 31, rand, false)
        break
      case 'window':
        break
    }
  })
}

export interface Ambient {
  update(t: number): void
}

export function drawFurniture(furniture: Furniture[], decor: WallDecor[], layer: Container, shadows: Graphics, coffee: { x: number; y: number }) {
  const built: Built = { screens: new Map(), arcades: [] }
  const rand = rng(42)
  for (const d of decor) drawDecor(d, layer, rand)
  for (const f of furniture) drawPiece(f, layer, built, rand, shadows)

  const clockDecor = decor.find((d) => d.kind === 'clock')
  const tvDecor = decor.find((d) => d.kind === 'tv')
  const clock = new Graphics()
  clock.zIndex = TILE * 2
  layer.addChild(clock)
  const fx = new Graphics()
  fx.zIndex = TILE * 3
  layer.addChild(fx)

  return {
    screens: built.screens,
    ambient: {
      update(t) {
        fx.clear()
        for (const a of built.arcades) {
          const f = Math.floor(t / 220)
          r(fx, a.x, a.y, TILE - 6, 7, 0x10102a)
          r(fx, a.x + (f % 8), a.y + 2, 2, 2, 0xf6e27a)
          r(fx, a.x + ((f * 3) % 9), a.y + 5, 1, 1, 0xe05090)
        }
        if (tvDecor) drawTv(fx, tvDecor.x * TILE + 3, tvDecor.y * TILE + 4, tvDecor.w * TILE - 6, 22, t)
        // The coffee machine is always on: gentle steam from the spout.
        for (let i = 0; i < 2; i++) {
            const k = (t / 450 + i / 3) % 1
            r(fx, coffee.x + Math.round(Math.sin(k * 6 + i) * 1.5), coffee.y - k * 10, 1, 1, 0xffffff, 1 - k)
          }
        if (clockDecor) drawClock(clock, clockDecor.x * TILE + 8, clockDecor.y * TILE + 14)
      }
    } satisfies Ambient
  }
}

// A real clock: it shows the user's local time.
function drawClock(g: G, cx: number, cy: number) {
  g.clear()
  const ring = [
    '..#####..',
    '.#.....#.',
    '#.......#',
    '#.......#',
    '#.......#',
    '#.......#',
    '#.......#',
    '.#.....#.',
    '..#####..'
  ]
  ring.forEach((row, y) =>
    [...row].forEach((c, x) => {
      const px = cx - 4 + x
      const py = cy - 4 + y
      if (c === '#') r(g, px, py, 1, 1, 0xd04040)
      else if (Math.abs(x - 4) + Math.abs(y - 4) < 6 && row.indexOf('#') < x && row.lastIndexOf('#') > x) r(g, px, py, 1, 1, 0xf6f6f2)
    })
  )
  r(g, cx - 5, cy - 3, 1, 5, P.ink)
  r(g, cx + 5, cy - 3, 1, 5, P.ink)
  const now = new Date()
  const hand = (angle: number, len: number, color: number) => {
    for (let i = 1; i <= len; i++) r(g, cx + Math.round(Math.sin(angle) * i), cy - Math.round(Math.cos(angle) * i), 1, 1, color)
  }
  hand(((now.getHours() % 12) + now.getMinutes() / 60) * (Math.PI / 6), 2, P.ink)
  hand(now.getMinutes() * (Math.PI / 30), 3, 0x3a3a48)
  r(g, cx, cy, 1, 1, P.ink)
}

// The lounge TV plays a slow sunset-over-the-city loop.
function drawTv(g: G, x: number, y: number, w: number, h: number, t: number) {
  const sky = [0x2a2050, 0x5a2a70, 0xb04a6a, 0xe0805a]
  sky.forEach((c, i) => r(g, x, y + Math.floor((i * h) / 4), w, Math.ceil(h / 4), c))
  const sun = Math.floor(t / 600) % 10
  r(g, x + w / 2 - 3, y + 8 + (sun > 5 ? 10 - sun : sun) / 2, 6, 5, 0xf6d27a)
  for (let i = 0; i < w; i += 4) r(g, x + i, y + h - 6 - ((i * 7) % 5), 3, 6 + ((i * 7) % 5), 0x14101e)
  r(g, x, y, w, 1, 0xffffff, 0.08)
}
