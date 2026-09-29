export interface Box {
  id: string
  x: number
  y: number
  w: number
  h: number
}

const hits = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
const MAX_STEPS = 6

/** Greedy de-overlap: each box moves along `dir` (1 down, -1 up) until it clears every box placed before it and every `fixed` box. */
export function spread(boxes: Box[], dir: 1 | -1, fixed: Box[] = []): Record<string, number> {
  const placed: Box[] = [...fixed]
  const out: Record<string, number> = {}
  const order = [...boxes].sort((a, b) => (dir === 1 ? a.y - b.y : b.y - a.y) || a.x - b.x)
  for (const b of order) {
    let cur = b
    for (let step = 0; step < MAX_STEPS && placed.some((p) => hits(p, cur)); step++) {
      const blocker = placed.find((p) => hits(p, cur))!
      cur = { ...cur, y: dir === 1 ? blocker.y + blocker.h : blocker.y - cur.h }
    }
    out[b.id] = cur.y - b.y
    placed.push(cur)
  }
  return out
}
