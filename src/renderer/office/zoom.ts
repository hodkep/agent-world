/** The zoom marks of the viewer: 100% is the file fitted to the panel. */
export const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3]

/** The next mark above or below `level`, stopping at both ends. */
export function zoomStep(level: number, dir: 1 | -1): number {
  const up = ZOOMS.find((z) => z > level + 1e-9)
  const down = [...ZOOMS].reverse().find((z) => z < level - 1e-9)
  return (dir === 1 ? up : down) ?? (dir === 1 ? ZOOMS[ZOOMS.length - 1]! : ZOOMS[0]!)
}
