/** A zoom level: a mark from 50% to 300%, or a fit to the panel's width or to a whole page or slide. */
export type Zoom = number | 'width' | 'page'

/** The zoom marks of the viewer: 100% is the file at its own size. */
export const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3]

export const zoomLabel = (z: Zoom): string => (z === 'width' ? 'Fit width' : z === 'page' ? 'Fit page' : `${Math.round(z * 100)}%`)

/** The next mark above or below `level`, stopping at both ends. A fit has no mark of its own, so it steps from 100%. */
export function zoomStep(level: Zoom, dir: 1 | -1): number {
  const at = typeof level === 'number' ? level : 1
  const up = ZOOMS.find((z) => z > at + 1e-9)
  const down = [...ZOOMS].reverse().find((z) => z < at - 1e-9)
  return (dir === 1 ? up : down) ?? (dir === 1 ? ZOOMS[ZOOMS.length - 1]! : ZOOMS[0]!)
}
