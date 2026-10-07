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
