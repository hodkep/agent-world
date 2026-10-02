import type { ReactNode } from 'react'

// Plain outline icons (24 grid, 2px square-ended strokes): the 8-bit bitmaps read badly this small.
const ICONS = {
  history: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  crew: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></>,
  money: <><circle cx="12" cy="12" r="9" /><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8M12 6v12" /></>,
  week: <><rect x="3" y="4" width="18" height="18" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  gear: <path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4" />,
  panel: <><rect x="3" y="3" width="18" height="18" /><path d="M15 3v18" /></>
} satisfies Record<string, ReactNode>

export type HeaderIconName = keyof typeof ICONS

/**
 * A top-bar button shown as an icon, to save room. Its name is still the accessible name, and the tooltip
 * (the hint, drawn by CSS) appears the moment the pointer or keyboard focus arrives, with no delay.
 */
export function IconButton({ icon, label, tip, onClick, disabled, pressed, expanded, haspopup, badge, className = '' }: { icon: HeaderIconName; label: string; tip: string; onClick: () => void; disabled?: boolean; pressed?: boolean; expanded?: boolean; haspopup?: boolean; badge?: number; className?: string }) {
  return (
    <button className={`tip-btn ${className}`} onClick={onClick} disabled={disabled} aria-label={label} aria-pressed={pressed} aria-expanded={expanded} aria-haspopup={haspopup ? 'dialog' : undefined} data-tip={tip === label ? label : `${label} · ${tip}`}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
        {ICONS[icon]}
      </svg>
      {badge !== undefined && <span className="tip-badge" aria-hidden="true">{badge}</span>}
    </button>
  )
}
