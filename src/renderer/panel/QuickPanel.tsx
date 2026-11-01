import { type KeyboardEvent, type ReactNode, useLayoutEffect, useRef } from 'react'

/** How far to move a panel sideways so it lies inside the window with `margin` to spare: left if it runs past the right edge, right if it starts before the left one. */
export function shiftIntoWindow(left: number, right: number, width: number, margin = 12): number {
  const shift = Math.min(0, width - margin - right)
  return left + shift < margin ? margin - left : shift
}

/**
 * The panel under a switcher button: a title with how many there are (and a search box when there are many), a grid of tiles that scrolls
 * when they do not all fit (the title and the footer stay), and a footer. Arrow keys move over the tiles, Enter picks, 1 to 9 pick a numbered tile.
 */
export function QuickPanel({ label, title, count, search, onSearch, onSearchEnter, footer, actions, children, className = '' }: { actions?: ReactNode; label: string; title: string; count: number; search?: string; onSearch?: (text: string) => void; onSearchEnter?: () => void; footer?: ReactNode; children: ReactNode; className?: string }) {
  const grid = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  // Opened under a button far to the right the panel would run out of the window: it is moved over by what does, and its arrow stays under the button.
  useLayoutEffect(() => {
    const wrap = panel.current?.parentElement
    if (!wrap || !panel.current) return
    const fit = () => {
      wrap.style.left = ''
      const r = wrap.getBoundingClientRect()
      const shift = shiftIntoWindow(r.left, r.right, window.innerWidth)
      wrap.style.left = shift ? `${shift}px` : ''
      panel.current?.style.setProperty('--shift', `${-shift}px`)
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])
  const tiles = () => [...(grid.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])]
  const columns = () => (grid.current ? getComputedStyle(grid.current).gridTemplateColumns.split(' ').length || 1 : 1)
  const keys = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return
    const all = tiles()
    const at = all.indexOf(document.activeElement as HTMLButtonElement)
    const move = (to: number) => (e.preventDefault(), all[Math.max(0, Math.min(all.length - 1, to))]?.focus())
    if (e.key === 'ArrowRight') move(at + 1)
    else if (e.key === 'ArrowLeft') move(at - 1)
    else if (e.key === 'ArrowDown') move(at < 0 ? 0 : at + columns())
    else if (e.key === 'ArrowUp') move(at - columns())
    else if (/^[1-9]$/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const tile = all.find((t) => t.dataset.n === e.key)
      if (tile) (e.preventDefault(), tile.click())
    }
  }
  return (
    <div ref={panel} className={`qp ${className}`} role="menu" aria-label={label} onKeyDown={keys}>
      <div className="qh">
        <b>{title}</b>
        <span>{count}</span>
        {actions}
        {onSearch && (
          <input className="qs" value={search ?? ''} onChange={(e) => onSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onSearchEnter?.()} placeholder="Find…" aria-label={`Find in ${title.toLowerCase()}`} />
        )}
      </div>
      <div className="qg" ref={grid}>
        {children}
      </div>
      {footer && <div className="qf">{footer}</div>}
    </div>
  )
}
