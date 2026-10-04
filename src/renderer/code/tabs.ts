/** The files open as tabs in the Files view, in the order they were opened, and which one is shown. */
export interface TabState {
  open: string[]
  active: string | null
}

/** Opens a file in a new tab at the end, or switches to it if it already has one. */
export const openTab = (s: TabState, path: string): TabState => ({ open: s.open.includes(path) ? s.open : [...s.open, path], active: path })

/** Closes a tab. If it was the one shown, the tab on its right takes its place, or the one on its left when it was last. */
export function closeTab(s: TabState, path: string): TabState {
  const at = s.open.indexOf(path)
  if (at < 0) return s
  const open = s.open.filter((p) => p !== path)
  return { open, active: s.active === path ? (open[Math.min(at, open.length - 1)] ?? null) : s.active }
}
