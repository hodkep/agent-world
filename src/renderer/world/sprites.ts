import { Texture } from 'pixi.js'
import type { Role } from './worldState'

export type View = 'front' | 'back' | 'side'
export type Pose = 'stand' | 'walk1' | 'walk2' | 'sit'

// 16x24 layers. '.' keeps whatever is below. Keys:
// o outline · h/H hair · s/S skin · e eye · c/C clothes · a accent · A cap · g gold · l badge · w shirt · p pants · k shoes
const R = (s: string, n = 1) => Array<string>(n).fill(s)

const HEAD_FRONT = [
  ...R('................', 2),
  '.....oooooo.....',
  '....osssssso....',
  ...R('...osssssssso...', 3),
  ...R('...osesssseso...', 2),
  '...osssssssSo...',
  '....oSSSSSSo....',
  '......oSSo......'
]
const HEAD_SIDE = [
  ...R('................', 2),
  '.....ooooo......',
  '....ossssso.....',
  ...R('...osssssso.....', 3),
  ...R('...osssseso.....', 2),
  '...osssssso.....',
  '....oSSSSSo.....',
  '......oSSo......'
]

const TORSO_FRONT = [
  '...occcccccco...',
  '..occcccccccco..',
  ...R('..ocoCccccCoco..', 3),
  '..osoCccccCoso..',
  '...oppppppppo...'
]
const TORSO_SIDE = [
  '.....occcco.....',
  '....occcccco....',
  ...R('....occCCcco....', 3),
  '....occsscco....',
  '....oppppppo....'
]

const LEGS: Record<'front' | 'side' | 'back', Record<Pose, string[]>> = {
  front: {
    stand: [...R('...opppoopppo...', 3), '...okkkookkko...', '...oooo..oooo...'],
    walk1: [...R('...opppoopppo...', 2), '...okkkoopppo...', '....ooo.okkko...', '.........oooo...'],
    walk2: [...R('...opppoopppo...', 2), '...opppookkko...', '...okkko.ooo....', '...oooo.........'],
    sit: ['...oppppppppo...', '...opppoopppo...', '...okkkookkko...', '....ooo..ooo....', '................']
  },
  // Seated seen from behind: the stool hides the legs.
  back: {
    stand: [],
    walk1: [],
    walk2: [],
    sit: ['...oppppppppo...', '....oooooooo....', ...R('................', 3)]
  },
  side: {
    stand: [...R('.....oppppo.....', 3), '.....okkkkko....', '.....ooooooo....'],
    walk1: ['....oppppppo....', '...oppo.oppo....', '..oppo...oppo...', '..okkko..okkko..', '..ooooo..ooooo..'],
    walk2: [...R('.....oppppo.....', 3), '.....okkkkko....', '.....ooooooo....'],
    sit: ['....opppppppo...', '....oppppppppo..', '.........okkko..', '.........ooooo..', '................']
  }
}

// Hair layers per style, rows 0..13 from the top.
const HAIR: Record<View, string[][]> = {
  front: [
    ['', '.....oooooo.....', '....ohhhhhho....', '...ohhhhhhhho...', '...ohhhhhhhHo...', '...ohh....hho...', '...oh......ho...'],
    ['', '.....oooooo.....', '....ohhhhhho....', '...ohhhhhhhho...', '...ohhhhhhhHo...', '..ohhh....hhho..', ...R('..oh........ho..', 7), '..oo........oo..'],
    ['......oooo......', '.....ohhhho.....', '....ohhhhhho....', '...ohhhhhhhho...', '...ohhhhhhhHo...', '...ohh....hho...', '...oh......ho...'],
    ['.....o.oo.o.....', '....ohohhoho....', '....ohhhhhho....', '...ohhhhhhhho...', '...ohhhhhhhHo...', '...oh.h..h.ho...', '...oh......ho...'],
    ['', '.....oooooo.....', '....ohhhhhho....', '...ohhhhhhhho...', '...ohhhhhhhHo...', '...ohhhh..hho...', '...ohh.....ho...']
  ],
  back: [
    ['', '.....oooooo.....', '....ohhhhhho....', ...R('...ohhhhhhhho...', 6), '...ohHHHHHHho...'],
    ['', '.....oooooo.....', '....ohhhhhho....', ...R('..ohhhhhhhhhho..', 10), '..oooooooooooo..'],
    ['......oooo......', '.....ohhhho.....', '....ohhhhhho....', ...R('...ohhhhhhhho...', 6), '...ohHHHHHHho...'],
    ['.....o.oo.o.....', '....ohohhoho....', '....ohhhhhho....', ...R('...ohhhhhhhho...', 6), '...ohHHHHHHho...'],
    ['', '.....oooooo.....', '....ohhhhhho....', ...R('...ohhhhhhhho...', 6), '...ohHHHHHHho...']
  ],
  side: [
    ['', '.....ooooo......', '....ohhhhho.....', ...R('...ohhhhhhho....', 2), '...ohhh.........', '...ohh..........', '...oh...........'],
    ['', '.....ooooo......', '....ohhhhho.....', ...R('...ohhhhhhho....', 2), '...ohhh.........', ...R('..ohhh..........', 6), '..ooo...........'],
    ['....ooo.........', '...ohhhoooo.....', '....ohhhhho.....', ...R('...ohhhhhhho....', 2), '...ohhh.........', '...ohh..........'],
    ['.....o.o.o......', '....ohohoho.....', '....ohhhhho.....', ...R('...ohhhhhhho....', 2), '...ohhh.........', '...ohh..........'],
    ['', '.....ooooo......', '....ohhhhho.....', ...R('...ohhhhhhho....', 2), '...ohhhhh.......', '...ohh..........']
  ]
}

const CAP: Record<View, string[]> = {
  front: ['', '.....oooooo.....', '....oAAAAAAo....', '...oAAAAAAAAo...', '...oAAAAAAAAo...', '..oooooooooooo..'],
  back: ['', '.....oooooo.....', '....oAAAAAAo....', ...R('...oAAAAAAAAo...', 3)],
  side: ['', '.....ooooo......', '....oAAAAAo.....', '...oAAAAAAAo....', '...oAAAAAAAAAo..', '...oooooooooo...']
}
// The dark band under the crown keeps it visible on blonde or grey hair.
const CROWN = ['.....g.gg.g.....', '....oggggggo....', '....oooooooo....']
const CROWN_SIDE = ['.....g.g.g......', '....ogggggo.....', '....ooooooo.....']

// Seniors wear hoodies: the hood gathers behind the neck and shows from every side.
const HOOD: Record<View, string[]> = {
  front: ['', '....oCo..oCo....'],
  back: ['....oCCCCCCo....', '...oCCCCCCCCo...'],
  side: ['..oCo...........', '..oCCo..........']
}

// Torso details per role, rows 12..17.
const OUTFIT: Record<Role, Record<View, string[]>> = {
  senior: {
    front: ['...oCCa..aCCo...', '......a..a......', '', '', '.....CCCCCC.....'],
    back: ['...oCccccccCo...', '....CCCCCCCC....'],
    side: ['...oCCC.........']
  },
  boss: {
    front: ['......waaw......', '.......aa.......', '.......aa.......', '.......aa.......', '.......aa.......'],
    back: [],
    side: ['........w.......']
  },
  intern: {
    front: ['.....aa..aa.....', '......aaaa......', '......llll......', '......llll......'],
    back: ['.....aa..aa.....'],
    side: ['........aa......', '........ll......', '........ll......']
  }
}

function hash(s: string) {
  let h = 2166136261
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return h >>> 0
}

export function stamp(rows: string[], layer: string[], top = 0) {
  layer.forEach((line, i) => {
    const y = top + i
    if (!line || !rows[y]) return
    rows[y] = [...rows[y]!].map((c, x) => (line[x] && line[x] !== '.' ? line[x]! : c)).join('')
  })
}

// Authoring guard: a stray non-ASCII lookalike in the tables above must never ship as a broken pixel.
export const clean = (rows: string[]) => rows.map((r) => r.replace(/[^\x20-\x7e]/g, 'o'))

/** Head, torso and legs with the hair the key picks, before any role's clothes: what the staff are dressed from too. */
export function bodyPixels(key: string, view: View, pose: Pose): string[] {
  const side = view === 'side'
  const head = side ? HEAD_SIDE : HEAD_FRONT
  const torso = side ? TORSO_SIDE : TORSO_FRONT
  const legs = view === 'back' && pose === 'sit' ? LEGS.back.sit : LEGS[side ? 'side' : 'front'][pose]
  const rows = clean([...head, ...torso, ...legs])
  // The back view is the front silhouette with the face painted over by hair.
  const style = hash(key) % 5
  stamp(rows, clean(HAIR[view][style]!))
  return rows
}

export function characterPixels(key: string, role: Role, view: View, pose: Pose): string[] {
  const rows = bodyPixels(key, view, pose)
  if (role === 'intern') stamp(rows, clean(CAP[view]))
  if (role === 'boss') stamp(rows, view === 'side' ? CROWN_SIDE : CROWN)
  if (role === 'senior') stamp(rows, HOOD[view], 10)
  stamp(rows, clean(OUTFIT[role][view]), 12)
  if (view === 'back') for (let y = 0; y < 12; y++) rows[y] = rows[y]!.replace(/e/g, 'h')
  return rows
}

// 7x5 bubble icons, '#' ink.
export const ICONS: Record<string, string[]> = {
  thinking: ['.......', '.......', '#.#.#..', '.......', '.......'],
  researching: ['.###...', '#...#..', '#...#..', '.###...', '....##.'],
  implementing: ['.#...#.', '#..#..#', '#..#..#', '#.#...#', '.#...#.'],
  running: ['#......', '.#.....', '..#....', '.#.....', '#..###.'],
  delegating: ['..###..', '...#...', '.#####.', '.#...#.', '###.###'],
  permission: ['...#...', '...#...', '...#...', '.......', '...#...'],
  waiting: ['.###...', '#...#..', '...#...', '..#....', '..#....'],
  asleep: ['####...', '..#....', '.#..###', '####.#.', '....###'],
  compacting: ['#######', '.#...#.', '..#.#..', '.#.#.#.', '#######'],
  blocked: ['..###..', '.#.#.#.', '.#.##..', '.#...#.', '..###..'],
  idle: ['.......', '.......', '.......', '.......', '.......']
}

export type Palette = Record<'o' | 'h' | 'H' | 's' | 'S' | 'e' | 'c' | 'C' | 'a' | 'A' | 'g' | 'l' | 'w' | 'p' | 'k', number>

const HAIR_COLORS = [0x2b1d14, 0x5a3825, 0xc8913a, 0x1c1c24, 0x9a3a2a, 0xe0d0a8, 0x3d4a6b, 0x7a4a9a, 0x6a6a72]
const SKIN = [0xf5d0a9, 0xe0ac7e, 0xb07a52, 0x7a4e32, 0xf8dcc4]
const HOODIE = [0x3f7fbf, 0x4f9a6a, 0x9a4f7a, 0x5a5f6a, 0xc0703a, 0x5a5fb0, 0x2f8a8a]
const SUIT = [0x2a2f45, 0x3a2e2e, 0x243440]
const TEE = [0xe0b030, 0x40a0a0, 0xe06a6a, 0x80c050, 0xe08a3a]

const shade = (c: number, f: number) =>
  (Math.round(((c >> 16) & 255) * f) << 16) | (Math.round(((c >> 8) & 255) * f) << 8) | Math.round((c & 255) * f)
const pick = <T,>(xs: T[], n: number) => xs[n % xs.length]!

export function paletteFor(key: string, role: Role): Palette {
  const n = hash(key)
  const hair = pick(HAIR_COLORS, n >>> 4)
  const skin = pick(SKIN, n >>> 9)
  const clothes = role === 'boss' ? pick(SUIT, n >>> 13) : role === 'intern' ? pick(TEE, n >>> 13) : pick(HOODIE, n >>> 13)
  return {
    o: 0x1a1522,
    h: hair,
    H: shade(hair, 0.72),
    s: skin,
    S: shade(skin, 0.84),
    e: 0x1a1522,
    c: clothes,
    C: shade(clothes, 0.74),
    a: role === 'boss' ? 0xc8303e : role === 'intern' ? 0x2f5fd0 : 0xf0f0f4,
    A: 0x2f5fd0,
    g: 0xf2c230,
    l: 0xf4f4f8,
    w: 0xf4f4f8,
    p: role === 'boss' ? shade(clothes, 0.85) : 0x2d3552,
    k: 0x2a2024
  }
}

const cache = new Map<string, Texture>()

export function pixelTexture(rows: string[], colors: Record<string, number>, cacheKey: string): Texture {
  const hit = cache.get(cacheKey)
  if (hit) return hit
  const canvas = document.createElement('canvas')
  canvas.width = rows[0]!.length
  canvas.height = rows.length
  const ctx = canvas.getContext('2d')!
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const c = colors[ch]
      if (c === undefined) return
      ctx.fillStyle = `#${c.toString(16).padStart(6, '0')}`
      ctx.fillRect(x, y, 1, 1)
    })
  )
  const tex = Texture.from(canvas)
  tex.source.scaleMode = 'nearest'
  cache.set(cacheKey, tex)
  return tex
}

export function characterTexture(key: string, role: Role, view: View, pose: Pose, eyesClosed = false) {
  const pal = paletteFor(key, role)
  const colors = { ...pal, ...(eyesClosed && { e: pal.S }) } as Record<string, number>
  return pixelTexture(characterPixels(key, role, view, pose), colors, `${key}/${role}/${view}/${pose}/${eyesClosed}`)
}

export function iconTexture(icon: string, ink: number) {
  return pixelTexture(ICONS[icon] ?? ICONS.idle!, { '#': ink }, `icon/${icon}/${ink}`)
}
