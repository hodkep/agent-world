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
export function cardLayout(o: { w: number; h: number; agentX: number; panel?: boolean }): { mode: CardMode; side: 'left' | 'right'; size: typeof CARD_FULL | null } {
  const side = o.agentX >= o.w / 2 ? 'left' : 'right'
  if (o.panel) return { mode: 'panel', side, size: null }
  if (o.w >= 860 && o.h >= CARD_FULL.h + MARGIN) return { mode: 'full', side, size: CARD_FULL }
  if (o.w >= 640 && o.h >= CARD_COMPACT.h + MARGIN) return { mode: 'compact', side, size: CARD_COMPACT }
  return { mode: 'panel', side, size: null }
}
