// The grid as a tiling: the space is split in two again and again, so any tile can sit anywhere, take any share,
// and be dragged to any edge of any other. A leaf holds an agent's id or a shell (an id starting with `term:`).

export interface Leaf {
  kind: 'leaf'
  tile: string
}
export interface Split {
  kind: 'split'
  /** `row`: side by side (a left, b right). `col`: stacked (a on top, b below). */
  dir: 'row' | 'col'
  /** The share of the space a takes, 0 to 1. */
  at: number
  a: Node
  b: Node
}
export type Node = Leaf | Split
export type Zone = 'left' | 'right' | 'top' | 'bottom' | 'center'
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export const MIN_SHARE = 0.12
export const TERM = 'term:'
export const isTerm = (id: string | null): id is string => !!id && id.startsWith(TERM)

const leaf = (tile: string): Leaf => ({ kind: 'leaf', tile })
const split = (dir: Split['dir'], a: Node, b: Node, at = 0.5): Split => ({ kind: 'split', dir, at, a, b })

export function tilesOf(n: Node | null): string[] {
  if (!n) return []
  return n.kind === 'leaf' ? [n.tile] : [...tilesOf(n.a), ...tilesOf(n.b)]
}

/** Equal shares of the space for these tiles: rows of two across up to four tiles, three across after that. */
export function even(tiles: string[]): Node | null {
  if (tiles.length === 0) return null
  const per = tiles.length <= 4 ? 2 : 3
  const rows = Math.ceil(tiles.length / per)
  const base = Math.floor(tiles.length / rows)
  const sizes = Array.from({ length: rows }, (_, i) => base + (i < tiles.length % rows ? 1 : 0))
  let at = 0
  const line = (ts: string[], dir: Split['dir']): Node => (ts.length === 1 ? leaf(ts[0]!) : split(dir, leaf(ts[0]!), line(ts.slice(1), dir), 1 / ts.length))
  const rowNodes = sizes.map((s) => line(tiles.slice(at, (at += s)), 'row'))
  const stack = (ns: Node[]): Node => (ns.length === 1 ? ns[0]! : split('col', ns[0]!, stack(ns.slice(1)), 1 / ns.length))
  return stack(rowNodes)
}

export function rectsOf(n: Node | null, r: Rect = { x: 0, y: 0, w: 1, h: 1 }): { tile: string; rect: Rect }[] {
  if (!n) return []
  if (n.kind === 'leaf') return [{ tile: n.tile, rect: r }]
  const [ra, rb] = halves(n, r)
  return [...rectsOf(n.a, ra), ...rectsOf(n.b, rb)]
}

function halves(s: Split, r: Rect): [Rect, Rect] {
  return s.dir === 'row'
    ? [
        { x: r.x, y: r.y, w: r.w * s.at, h: r.h },
        { x: r.x + r.w * s.at, y: r.y, w: r.w * (1 - s.at), h: r.h }
      ]
    : [
        { x: r.x, y: r.y, w: r.w, h: r.h * s.at },
        { x: r.x, y: r.y + r.h * s.at, w: r.w, h: r.h * (1 - s.at) }
      ]
}

/** Every split with the space it divides: a gutter sits on its dividing line. `path` names it (0 = a, 1 = b at each step). */
export function splitsOf(n: Node | null, r: Rect = { x: 0, y: 0, w: 1, h: 1 }, path: number[] = []): { path: number[]; dir: Split['dir']; at: number; rect: Rect }[] {
  if (!n || n.kind === 'leaf') return []
  const [ra, rb] = halves(n, r)
  return [{ path, dir: n.dir, at: n.at, rect: r }, ...splitsOf(n.a, ra, [...path, 0]), ...splitsOf(n.b, rb, [...path, 1])]
}

/** Give a split a new share (kept clear of the edges), leaving everything else as it was. */
export function resizeAt(n: Node | null, path: number[], at: number): Node | null {
  if (!n || n.kind === 'leaf') return n
  const next = Math.max(MIN_SHARE, Math.min(1 - MIN_SHARE, at))
  if (path.length === 0) return { ...n, at: next }
  const [head, ...rest] = path
  return head === 0 ? { ...n, a: resizeAt(n.a, rest, next)! } : { ...n, b: resizeAt(n.b, rest, next)! }
}

/**
 * The layout as drawn while `hidden` is out of the way: the tile keeps its place in the tree but takes no space, and its
 * neighbour fills the gap. Nothing is removed, so the layout that was saved is untouched, edits made meanwhile apply to it
 * (the splits keep their paths), and showing the tile again puts it back exactly where it was.
 */
export function collapse(n: Node | null, hidden: string | null): Node | null {
  if (!n || !hidden || n.kind === 'leaf') return n
  if (n.a.kind === 'leaf' && n.a.tile === hidden) return { ...n, at: 0 }
  if (n.b.kind === 'leaf' && n.b.tile === hidden) return { ...n, at: 1 }
  const a = collapse(n.a, hidden)!
  const b = collapse(n.b, hidden)!
  return a === n.a && b === n.b ? n : { ...n, a, b }
}

/** Take a tile out; the one it shared a split with takes its space. */
export function remove(n: Node | null, tile: string): Node | null {
  if (!n) return null
  if (n.kind === 'leaf') return n.tile === tile ? null : n
  const a = remove(n.a, tile)
  const b = remove(n.b, tile)
  if (!a) return b
  if (!b) return a
  return a === n.a && b === n.b ? n : { ...n, a, b }
}

const swapTiles = (n: Node, x: string, y: string): Node =>
  n.kind === 'leaf' ? (n.tile === x ? leaf(y) : n.tile === y ? leaf(x) : n) : { ...n, a: swapTiles(n.a, x, y), b: swapTiles(n.b, x, y) }

function splitLeaf(n: Node, target: string, make: (l: Leaf) => Node): Node {
  if (n.kind === 'leaf') return n.tile === target ? make(n) : n
  return { ...n, a: splitLeaf(n.a, target, make), b: splitLeaf(n.b, target, make) }
}

/**
 * Put `tile` next to `target`: on the side of the zone it was dropped in, or, in the middle, in place of it when the
 * tile is already in the grid (the two swap). A tile already in the grid is moved, never shown twice.
 */
export function place(root: Node | null, tile: string, target: string, zone: Zone): Node | null {
  if (tile === target) return root
  if (!root || !tilesOf(root).includes(target)) return add(root, tile)
  if (zone === 'center' && tilesOf(root).includes(tile)) return swapTiles(root, tile, target)
  const base = remove(root, tile)!
  const dir: Split['dir'] = zone === 'left' || zone === 'right' ? 'row' : zone === 'top' || zone === 'bottom' ? 'col' : longerSide(base, target)
  const first = zone === 'left' || zone === 'top'
  return splitLeaf(base, target, (l) => (first ? split(dir, leaf(tile), l) : split(dir, l, leaf(tile))))
}

function longerSide(root: Node, tile: string): Split['dir'] {
  const r = rectsOf(root).find((x) => x.tile === tile)?.rect
  return r && r.h > r.w ? 'col' : 'row'
}

/**
 * A new tile finds its own place. A terminal becomes a strip along the bottom, the way a terminal sits in an editor;
 * anything else splits the biggest tile along its longer side, so the space is shared out as evenly as it can be.
 */
export function add(root: Node | null, tile: string): Node | null {
  const base = remove(root, tile)
  if (!base) return leaf(tile)
  if (isTerm(tile)) return split('col', base, leaf(tile), 0.68)
  const rects = rectsOf(base)
  const biggest = rects.reduce((best, r) => (r.rect.w * r.rect.h > best.rect.w * best.rect.h ? r : best))
  return splitLeaf(base, biggest.tile, (l) => split(biggest.rect.h * 0.7 > biggest.rect.w ? 'col' : 'row', l, leaf(tile)))
}

export function addAll(root: Node | null, tiles: string[]): Node | null {
  return tiles.reduce<Node | null>((n, t) => (tilesOf(n).includes(t) ? n : add(n, t)), root)
}

export function keepOnly(root: Node | null, keep: (tile: string) => boolean): Node | null {
  return tilesOf(root).reduce<Node | null>((n, t) => (keep(t) ? n : remove(n, t)), root)
}

const isNode = (v: unknown): v is Node => {
  if (!v || typeof v !== 'object') return false
  const n = v as Record<string, unknown>
  if (n.kind === 'leaf') return typeof n.tile === 'string' && n.tile.length > 0
  return n.kind === 'split' && (n.dir === 'row' || n.dir === 'col') && typeof n.at === 'number' && n.at > 0 && n.at < 1 && isNode(n.a) && isNode(n.b)
}

/** A saved layout: the current tiling, or an older list-shaped one (its tiles are laid out evenly). Null for anything else. */
export function readLayout(raw: unknown): { root: Node | null } | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as { root?: unknown; panes?: unknown; cells?: unknown }
  if (r.root === null) return { root: null }
  if (isNode(r.root)) {
    // A tile twice would be shown twice: keep the first.
    const seen = new Set<string>()
    const tiles = tilesOf(r.root)
    return tiles.every((t) => (seen.has(t) ? false : (seen.add(t), true))) ? { root: r.root } : { root: even([...seen]) }
  }
  const list = Array.isArray(r.panes) ? r.panes : Array.isArray(r.cells) ? r.cells : null
  if (!list) return null
  return { root: even([...new Set(list.filter((x): x is string => typeof x === 'string' && x.length > 0))]) }
}
