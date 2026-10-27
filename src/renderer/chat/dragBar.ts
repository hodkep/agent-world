/** Where the Keep and Undo bar sits once it has been dragged: its top left corner in the window, in pixels. */
export interface Spot {
  x: number
  y: number
}

const HANDLE = 80

/** The nearest place the bar may be: at least a handle of it stays in the window on each side, so it can always be found and dragged back. */
export function clampBar(p: Spot, bar: { width: number; height: number }, view: { width: number; height: number }): Spot {
  const minX = -(bar.width - HANDLE)
  const maxX = Math.max(minX, view.width - HANDLE)
  return { x: Math.round(Math.min(maxX, Math.max(minX, p.x))), y: Math.round(Math.min(Math.max(0, view.height - 40), Math.max(0, p.y))) }
}

/** A remembered position read back; anything that is not two finite numbers is no position. */
export function readBar(raw: string | null): Spot | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as { x?: unknown; y?: unknown }
    return typeof v?.x === 'number' && typeof v?.y === 'number' && Number.isFinite(v.x) && Number.isFinite(v.y) ? { x: v.x, y: v.y } : null
  } catch {
    return null
  }
}
