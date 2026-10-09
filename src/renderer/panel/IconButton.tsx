import type { ReactNode } from 'react'

/** Run in terminal: a terminal window with a play triangle in it. */
const RUN_PATH = 'M4 5h16v14H4zM10 9v6l5-3z'

/** That icon as markup, for the button put on code blocks in a reply, which is made outside React. */
export const runIconMarkup = (size = 16) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><path d="${RUN_PATH}"/></svg>`

// Plain outline icons (24 grid, 2px square-ended strokes): the 8-bit bitmaps read badly this small.
const ICONS = {
  history: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  crew: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></>,
  money: <><circle cx="12" cy="12" r="9" /><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8M12 6v12" /></>,
  week: <><rect x="3" y="4" width="18" height="18" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  library: <path d="M3 5h7a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H3zM21 5h-7a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h7z" />,
  gear: <path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4" />,
  panel: <><rect x="3" y="3" width="18" height="18" /><path d="M15 3v18" /></>,
  keyboard: <><rect x="2" y="6" width="20" height="12" /><path d="M6 10h1M10 10h1M14 10h1M18 10h1M7 14h10" /></>,
  // The picture editor's tools.
  pen: <><path d="M3 21l1-5L16 4l4 4L8 20z" /><path d="M14 6l4 4" /></>,
  line: <path d="M4 20L20 4" />,
  arrow: <path d="M4 20L20 4M9 4h11v11" />,
  rect: <rect x="4" y="5" width="16" height="14" />,
  ellipse: <ellipse cx="12" cy="12" rx="9" ry="7" />,
  text: <path d="M5 6V4h14v2M12 4v16M9 20h6" />,
  hide: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /><path d="M3 3l18 18" /></>,
  undo: <><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></>,
  redo: <><path d="M15 14l5-5-5-5" /><path d="M20 9H10a6 6 0 0 0 0 12h3" /></>,
  trash: <path d="M3 6h18M8 6V3h8v3M6 6l1 15h10l1-15M10 11v6M14 11v6" />,
  // A note from a hook, and the fold button on it.
  flag: <path d="M5 21V4h13l-3 4.5 3 4.5H5" />,
  chevron: <path d="M6 9l6 6 6-6" />,
  // The kinds of tool on the profile card.
  terminal: <path d="M4 5h16v14H4zM7 10l3 2-3 2M12 15h5" />,
  run: <path d={RUN_PATH} />,
  plug: <path d="M9 3v5M15 3v5M6 8h12v4a6 6 0 0 1-12 0zM12 18v3" />,
  search: <><circle cx="10" cy="10" r="6" /><path d="M15 15l6 6" /></>,
  file: <path d="M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6" />,
  // The Preview's browser bar.
  back: <path d="M19 12H5M11 6l-6 6 6 6" />,
  forward: <path d="M5 12h14M13 6l6 6-6 6" />,
  reload: <path d="M20 12a8 8 0 1 1-2.5-5.8M20 4v5h-5" />,
  pointer: <path d="M5 3l14 7-6 2-2 6z" />,
  external: <path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" />,
  desktop: <path d="M3 4h18v12H3zM8 20h8M12 16v4" />,
  tablet: <><rect x="4" y="2" width="16" height="20" /><path d="M11 18h2" /></>,
  phone: <><rect x="7" y="2" width="10" height="20" /><path d="M11 18h2" /></>
} satisfies Record<string, ReactNode>

export type HeaderIconName = keyof typeof ICONS

/** The same outline icons without a button around them, for toolbars elsewhere. */
export function OutlineIcon({ name, size = 16 }: { name: HeaderIconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
      {ICONS[name]}
    </svg>
  )
}

/**
 * A top-bar button shown as an icon, to save room. Its name is still the accessible name, and the tooltip
 * (the hint, drawn by CSS) appears the moment the pointer or keyboard focus arrives, with no delay.
 */
export function IconButton({ icon, label, tip, onClick, disabled, pressed, expanded, haspopup, badge, className = '' }: { icon: HeaderIconName; label: string; tip: string; onClick: () => void; disabled?: boolean; pressed?: boolean; expanded?: boolean; haspopup?: boolean; badge?: number; className?: string }) {
  return (
    <button className={`tip-btn ${className}`} onClick={onClick} disabled={disabled} aria-label={label} aria-pressed={pressed} aria-expanded={expanded} aria-haspopup={haspopup ? 'dialog' : undefined} data-tip={tip === label ? label : `${label} · ${tip}`}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
        {ICONS[icon]}
      </svg>
      {badge !== undefined && <span className="tip-badge" aria-hidden="true">{badge}</span>}
    </button>
  )
}
