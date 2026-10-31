/** The terminal pane to the right of the chat, shown while the office is hidden: how wide it is, and the limits of dragging it. */
export const SIDE_MIN = 320
const clamp = (w: number, viewport: number) => Math.round(Math.max(SIDE_MIN, Math.min(viewport * 0.7, w)))

/** The pane's width: what was dragged, else about 40% of the window and never under 360px. */
export const sideWidth = (saved: number | null, viewport: number): number => (saved ? clamp(saved, viewport) : Math.round(Math.max(360, viewport * 0.4)))

/** The width while dragging its left edge: from the pointer to the window's right edge. */
export const dragWidth = (clientX: number, viewport: number): number => clamp(viewport - clientX, viewport)

/** The width after an arrow key on the edge: the left key pulls the edge left (wider), the right key pushes it right; null for any other key. */
export const keyWidth = (width: number, key: string, viewport: number): number | null => (key === 'ArrowLeft' ? clamp(width + 20, viewport) : key === 'ArrowRight' ? clamp(width - 20, viewport) : null)
