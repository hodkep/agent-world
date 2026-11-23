/** A hover card that stays on screen: placed with fixed coordinates from the cell it belongs to, so a panel's edge never cuts it off. */
const GAP = 6
const PAD = 8

interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

/** Under the cell and centred on it; above it when the window ends first; and never past an edge (the left one wins for a card wider than the window). */
export function placeTip(cell: Box, tip: { w: number; h: number }, win: { w: number; h: number }): { left: number; top: number } {
  const centred = (cell.left + cell.right) / 2 - tip.w / 2
  const left = Math.max(PAD, Math.min(centred, win.w - PAD - tip.w))
  const below = cell.bottom + GAP
  const top = below + tip.h + PAD <= win.h ? below : Math.max(PAD, cell.top - GAP - tip.h)
  return { left, top }
}

/** Measures the card inside a cell (shown for the moment, unseen) and writes where it goes; the stylesheet's `:hover` then shows it there. */
export function showTipAt(cell: HTMLElement, selector: string) {
  const tip = cell.querySelector<HTMLElement>(selector)
  if (!tip) return
  const { display, visibility } = tip.style
  tip.style.visibility = 'hidden'
  tip.style.display = 'block'
  const r = tip.getBoundingClientRect()
  const { left, top } = placeTip(cell.getBoundingClientRect(), { w: r.width, h: r.height }, { w: window.innerWidth, h: window.innerHeight })
  tip.style.left = `${left}px`
  tip.style.top = `${top}px`
  tip.style.display = display
  tip.style.visibility = visibility
}
