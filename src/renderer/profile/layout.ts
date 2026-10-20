/** The card's size on the page (CSS pixels) in its two overlay forms. */
export const CARD_FULL = { w: 292, h: 640 }
export const CARD_COMPACT = { w: 216, h: 440 }
const MARGIN = 16

export type CardMode = 'full' | 'compact' | 'panel'

/**
 * Where the profile card goes, from the room on the stage: on the side away from the agent so it never covers them;
 * smaller when the window is narrower; in the panel above the chat when there is too little room, rather than
 * cover the office.
 */
export function cardLayout(o: { w: number; h: number; agentX: number; panel?: boolean; prefer?: 'full' | 'compact' }): { mode: CardMode; side: 'left' | 'right'; size: typeof CARD_FULL | null } {
  const side = o.agentX >= o.w / 2 ? 'left' : 'right'
  if (o.panel) return { mode: 'panel', side, size: null }
  const fits = o.w >= 640 && o.h >= CARD_COMPACT.h + MARGIN
  if (!fits) return { mode: 'panel', side, size: null }
  // The size the user picked with the card's toggle wins; the full card on a short stage scrolls rather than not showing.
  const full = o.prefer ? o.prefer === 'full' : o.w >= 860 && o.h >= CARD_FULL.h + MARGIN
  return full ? { mode: 'full', side, size: CARD_FULL } : { mode: 'compact', side, size: CARD_COMPACT }
}

/** The zoom and Terminal buttons sit at the bottom left of the stage: their height, the gap under them and a little air above. */
export const CONTROLS_ROOM = 54

/** The tallest the card may be on the stage: its 10px of margin above and below, and clear of the terminal drawer and, on the left, of the buttons. */
export function cardMaxHeight(o: { stageH: number; side: 'left' | 'right'; drawerH: number }): number {
  return Math.max(0, o.stageH - 20 - o.drawerH - (o.side === 'left' ? CONTROLS_ROOM : 0))
}

const PANE_HEAD = 44
const SPOT_GAP = 4
const SPOT_EDGE = 8
/** The least of the card that must show: a pane low in the grid moves the card up rather than leave it a sliver. */
const MIN_SHOWN = 240

/**
 * Where the profile card goes when an agent's name is clicked in a pane of the grid: just under the pane's header, at its left edge, and kept inside the grid (against the
 * right edge for a pane that is far right, moved up for one that is low). `pane` is the tile's place as shares of the grid, `area` its size in pixels.
 */
export function gridCardSpot(area: { w: number; h: number }, pane: { x: number; y: number; w: number; h: number }): { mode: 'full' | 'compact'; left: number; top: number; maxHeight: number } {
  const mode = area.w >= 640 ? 'full' : 'compact'
  const wide = mode === 'full' ? CARD_FULL.w : CARD_COMPACT.w
  const left = Math.max(SPOT_GAP, Math.min(pane.x * area.w + SPOT_GAP, area.w - wide - SPOT_EDGE))
  const top = Math.max(SPOT_GAP, Math.min(pane.y * area.h + PANE_HEAD + SPOT_GAP, area.h - SPOT_EDGE - MIN_SHOWN))
  return { mode, left, top, maxHeight: area.h - top - SPOT_EDGE }
}
