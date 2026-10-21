export interface Pt {
  x: number
  y: number
}

export const TILE = 16

// Floors: w wood · b lounge carpet · k kitchen checker · E entrance
// Walls:  # solid wall · F back-wall face.  Furniture tiles become X (blocked) or S (seat).
// S tiles are destinations only: characters may end a walk on a sofa, never walk across one.
const FLOORS = new Set(['.', 'w', 'b', 'k', 'E'])

export interface OfficeMap {
  w: number
  h: number
  at: (x: number, y: number) => string
  walkable: (p: Pt) => boolean
  spots: (ch: string) => Pt[]
}

export function parseMap(rows: string[]): OfficeMap {
  const at = (x: number, y: number) => rows[y]?.[x] ?? '#'
  return {
    w: rows[0]?.length ?? 0,
    h: rows.length,
    at,
    walkable: (p) => FLOORS.has(at(p.x, p.y)),
    spots: (ch) => rows.flatMap((row, y) => [...row].flatMap((c, x) => (c === ch ? [{ x, y }] : [])))
  }
}

const DIRS: Pt[] = [
  { x: 0, y: 1 },
  { x: 1, y: 0 },
  { x: 0, y: -1 },
  { x: -1, y: 0 }
]

export function findPath(map: OfficeMap, from: Pt, to: Pt): Pt[] | null {
  const isGoal = (p: Pt) => p.x === to.x && p.y === to.y
  if (!map.walkable(to) && map.at(to.x, to.y) !== 'S') return null
  const key = (p: Pt) => p.y * map.w + p.x
  const came = new Map<number, Pt | null>([[key(from), null]])
  const queue: Pt[] = [from]
  while (queue.length) {
    const cur = queue.shift()!
    if (isGoal(cur)) {
      const path: Pt[] = []
      for (let p: Pt | null = cur; p && key(p) !== key(from); p = came.get(key(p)) ?? null) path.unshift(p)
      return path
    }
    for (const d of DIRS) {
      const n = { x: cur.x + d.x, y: cur.y + d.y }
      if (!came.has(key(n)) && (map.walkable(n) || isGoal(n))) {
        came.set(key(n), cur)
        queue.push(n)
      }
    }
  }
  return null
}

// ---- The office layout ---------------------------------------------------------------

export type Facing = 'up' | 'down' | 'left' | 'right'
/** Where a character rests. `ox` nudges it off the tile grid to centre it on wide furniture. */
export interface Spot extends Pt {
  facing: Facing
  ox: number
  seated: boolean
}

export type Furniture =
  | { kind: 'desk' | 'meeting' | 'sofa-top' | 'sofa-bottom' | 'coffee-table' | 'counter' | 'fridge' | 'arcade' | 'carrom'; x: number; y: number; w: number; h: number }
  | { kind: 'plant' | 'cooler' | 'printer' | 'bin' | 'bistro' | 'beanbag' | 'chair-desk' | 'chair-top' | 'chair-bottom'; x: number; y: number; w: number; h: number }

export type WallDecor =
  | { kind: 'shelf' | 'kanban' | 'vine' | 'clock' | 'frame' | 'tv' | 'wallplant' | 'window'; x: number; y: number; w: number; variant?: number }

export const W = 30
export const H = 17
const WORK = { x0: 1, x1: 17 }
const RIGHT = { x0: 19, x1: 28 }

const DESK_XS = [2, 6, 10, 14]
const DESK_ROWS = [3, 7]
const TABLE = { x: 5, y: 11, w: 6, h: 2 }
const INTERN_XS = [5, 7, 9]
const BEANBAG_XS = [20, 22, 24]

/** How many subagents fit around one main agent's desk; the rest use the shared table. */
export const RETINUE_SEATS = 6
// All of them face the main agent: first at the sides of the desk, a row below the chair and then a row above it, then across the desk.
// A sitter is taller than a tile, so no two share a column on neighbouring rows (that is why the chair's own row is left free).
// [dx, dy, facing, ox] from the chair tile, which is the left of the two tiles the agent sits across. The two across the desk
// are moved apart (ox) so the monitor in the middle of the desk does not hide them.
const RETINUE: [number, number, Facing, number][] = [[2, 1, 'left', 0], [-1, 1, 'right', 0], [2, -1, 'left', 0], [-1, -1, 'right', 0], [0, -2, 'down', -3], [1, -2, 'down', 3]]

/** The open floor where a main agent's nth subagent sits, next to the desk chair at `desk`; null when all are taken. */
export function retinueSpot(desk: Pt, n: number): Spot | null {
  const s = RETINUE[n]
  return s ? { x: desk.x + s[0], y: desk.y + s[1], facing: s[2], ox: s[3], seated: true } : null
}

function buildRows(furniture: Furniture[], seats: Pt[]) {
  const grid: string[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => '#'))
  const fill = (x0: number, x1: number, y0: number, y1: number, ch: string) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) grid[y]![x] = ch
  }
  fill(WORK.x0, WORK.x1, 0, 1, 'F')
  fill(WORK.x0, WORK.x1, 2, 15, 'w')
  fill(RIGHT.x0, RIGHT.x1, 0, 1, 'F')
  fill(RIGHT.x0, RIGHT.x1, 2, 12, 'b')
  fill(RIGHT.x0, RIGHT.x1, 13, 15, 'k')
  // Two doorways from the workroom into the lounge, and the entrance.
  fill(18, 18, 3, 4, 'b')
  fill(18, 18, 10, 11, 'b')
  fill(8, 9, 16, 16, 'E')
  for (const f of furniture) if (!f.kind.startsWith('chair')) fill(f.x, f.x + f.w - 1, f.y, f.y + f.h - 1, 'X')
  for (const s of seats) grid[s.y]![s.x] = 'S'
  return grid.map((r) => r.join(''))
}

function buildOffice() {
  const furniture: Furniture[] = []
  const desks: Spot[] = []
  const interns: Spot[] = []

  for (const y of DESK_ROWS)
    for (const x of DESK_XS) {
      furniture.push({ kind: 'desk', x, y, w: 2, h: 1 }, { kind: 'chair-desk', x, y: y + 1, w: 2, h: 1 })
      desks.push({ x, y: y + 1, facing: 'up', ox: 8, seated: true })
    }
  furniture.push({ kind: 'meeting', ...TABLE })
  for (const x of INTERN_XS) {
    furniture.push({ kind: 'chair-top', x, y: TABLE.y - 1, w: 2, h: 1 }, { kind: 'chair-bottom', x, y: TABLE.y + TABLE.h, w: 2, h: 1 })
    interns.push({ x, y: TABLE.y - 1, facing: 'down', ox: 8, seated: true }, { x, y: TABLE.y + TABLE.h, facing: 'up', ox: 8, seated: true })
  }
  furniture.push(
    { kind: 'plant', x: 1, y: 2, w: 1, h: 1 },
    { kind: 'plant', x: 1, y: 14, w: 1, h: 1 },
    { kind: 'cooler', x: 17, y: 2, w: 1, h: 1 },
    { kind: 'printer', x: 16, y: 14, w: 2, h: 1 },
    { kind: 'bin', x: 2, y: 15, w: 1, h: 1 },
    // Lounge, upper half: bean bags in front of the wall TV, arcade cabinets in the corner.
    ...BEANBAG_XS.map((x) => ({ kind: 'beanbag' as const, x, y: 4, w: 1, h: 1 })),
    { kind: 'arcade', x: 27, y: 2, w: 1, h: 1 },
    { kind: 'arcade', x: 28, y: 2, w: 1, h: 1 },
    { kind: 'plant', x: 19, y: 2, w: 1, h: 1 },
    // Lounge, lower half: sofas facing each other across a coffee table.
    { kind: 'sofa-top', x: 22, y: 8, w: 4, h: 1 },
    { kind: 'coffee-table', x: 23, y: 10, w: 2, h: 1 },
    { kind: 'sofa-bottom', x: 22, y: 11, w: 4, h: 1 },
    { kind: 'plant', x: 19, y: 8, w: 1, h: 1 },
    { kind: 'plant', x: 28, y: 8, w: 1, h: 1 },
    // The carrom board, where idle agents sit down to play: players stand on its four sides.
    { kind: 'carrom', x: 25, y: 5, w: 2, h: 2 },
    { kind: 'counter', x: 22, y: 15, w: 6, h: 1 },
    { kind: 'fridge', x: 28, y: 14, w: 1, h: 2 },
    { kind: 'bistro', x: 20, y: 14, w: 1, h: 1 }
  )

  const sofas: Spot[] = [
    ...[22, 23, 24, 25].flatMap((x) => [
      { x, y: 8, facing: 'down' as const, ox: 0, seated: true },
      { x, y: 11, facing: 'up' as const, ox: 0, seated: true }
    ]),
    ...BEANBAG_XS.map((x) => ({ x, y: 4, facing: 'up' as const, ox: 0, seated: true }))
  ]

  const decor: WallDecor[] = [
    { kind: 'vine', x: 1, y: 0, w: 1 },
    { kind: 'shelf', x: 2, y: 0, w: 3, variant: 1 },
    { kind: 'clock', x: 6, y: 0, w: 1 },
    { kind: 'kanban', x: 8, y: 0, w: 5 },
    { kind: 'shelf', x: 14, y: 0, w: 3, variant: 2 },
    { kind: 'vine', x: 17, y: 0, w: 1 },
    { kind: 'frame', x: 19, y: 0, w: 1, variant: 0 },
    { kind: 'tv', x: 20, y: 0, w: 5 },
    { kind: 'frame', x: 25, y: 0, w: 2, variant: 1 },
    { kind: 'frame', x: 27, y: 0, w: 1, variant: 2 }
  ]

  // Standing in front of the kanban board, where planning agents work and present their plans.
  const whiteboard: Spot[] = [9, 11, 8, 12, 10].map((x) => ({ x, y: 2, facing: 'up' as const, ox: 0, seated: false }))
  // Standing in front of the two wall bookshelves, where an agent reading a library item goes.
  const shelf: Spot[] = [3, 15, 4, 14, 2, 16].map((x) => ({ x, y: 2, facing: 'up' as const, ox: 0, seated: false }))
  const seats = [...desks, ...interns, ...sofas]
  const rows = buildRows(furniture, seats)
  const walkway = (xs: number[], y: number): Spot[] => xs.map((x) => ({ x, y, facing: 'down', ox: 0, seated: false }))
  return {
    rows,
    map: parseMap(rows),
    furniture,
    decor,
    door: { x: 8, y: 16, facing: 'up', ox: 8, seated: false } satisfies Spot,
    desks,
    interns,
    sofas,
    whiteboard,
    shelf,
    shelves: decor.filter((d) => d.kind === 'shelf'),
    kanban: decor.find((d) => d.kind === 'kanban')!,
    // ponytail: fixed overflow spots per room; a second floor per repo is the real fix when these fill up.
    overflow: {
      desk: walkway([3, 5, 7, 9, 11, 13, 15], 5),
      intern: walkway([2, 3, 13, 15], 14),
      lounge: walkway([19, 20, 21, 22, 23, 28], 7)
    }
  }
}

export const OFFICE = buildOffice()
