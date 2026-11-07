export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * A squarified treemap (Bruls, Huizing and van Wijk): one tile for each value, its area in proportion to the value, packed to fill a w by h
 * box and as close to square as can be, the biggest first at the top left, as in a market heatmap. `values` must be largest first; the tiles
 * come back in the same order. A value that is zero or less has no area, so nothing is drawn when nothing is positive.
 */
export function treemap(values: number[], w: number, h: number): Rect[] {
  const total = values.reduce((n, v) => n + Math.max(v, 0), 0)
  if (total <= 0 || w <= 0 || h <= 0) return []
  const areas = values.map((v) => (Math.max(v, 0) / total) * w * h)
  const out: Rect[] = []
  let box = { x: 0, y: 0, w, h }
  let row: number[] = []

  // The worst (longest against shortest) side among the tiles of a row laid along `side`.
  const worst = (r: number[], side: number) => {
    const s = r.reduce((n, a) => n + a, 0)
    return Math.max((side * side * Math.max(...r)) / (s * s), (s * s) / (side * side * Math.min(...r)))
  }
  // A row goes along the shorter side of what is left: a column down the left when the box is wide, a strip along the top when it is tall.
  const lay = (r: number[]) => {
    const s = r.reduce((n, a) => n + a, 0)
    if (box.w >= box.h) {
      const colW = s / box.h
      let y = box.y
      for (const a of r) (out.push({ x: box.x, y, w: colW, h: a / colW }), (y += a / colW))
      box = { x: box.x + colW, y: box.y, w: box.w - colW, h: box.h }
    } else {
      const rowH = s / box.w
      let x = box.x
      for (const a of r) (out.push({ x, y: box.y, w: a / rowH, h: rowH }), (x += a / rowH))
      box = { x: box.x, y: box.y + rowH, w: box.w, h: box.h - rowH }
    }
  }

  for (const a of areas) {
    if (a <= 0) continue
    const side = Math.min(box.w, box.h)
    if (row.length === 0 || worst([...row, a], side) <= worst(row, side)) row.push(a)
    else (lay(row), (row = [a]))
  }
  if (row.length) lay(row)
  return out
}
