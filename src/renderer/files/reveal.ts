/**
 * Right-click on anything that stands for a path on this computer: the system menu with Reveal in Finder. Any element marks itself with `data-reveal` (the path as
 * the page shows it); a path that is relative to an agent's folder sits under an element with `data-reveal-agent`. A file and a folder are the same to it.
 */
export function onRevealRightClick(e: MouseEvent) {
  const el = (e.target as HTMLElement | null)?.closest?.<HTMLElement>('[data-reveal]')
  const path = el?.dataset.reveal
  if (!el || !path) return
  e.preventDefault()
  void window.aw.revealMenu(el.closest<HTMLElement>('[data-reveal-agent]')?.dataset.revealAgent ?? '', path)
}
