import { PixelIcon, type IconName } from '../chat/PixelIcon'

/**
 * A top-bar button shown as an icon, to save room. Its name is still the accessible name, and the tooltip
 * (the hint, drawn by CSS) appears the moment the pointer or keyboard focus arrives, with no delay.
 */
export function IconButton({ icon, label, tip, onClick, disabled, pressed, expanded, haspopup, badge, className = '' }: { icon: IconName; label: string; tip: string; onClick: () => void; disabled?: boolean; pressed?: boolean; expanded?: boolean; haspopup?: boolean; badge?: number; className?: string }) {
  return (
    <button className={`tip-btn ${className}`} onClick={onClick} disabled={disabled} aria-label={label} aria-pressed={pressed} aria-expanded={expanded} aria-haspopup={haspopup ? 'dialog' : undefined} data-tip={tip === label ? label : `${label} · ${tip}`}>
      <PixelIcon name={icon} scale={2} />
      {badge !== undefined && <span className="tip-badge" aria-hidden="true">{badge}</span>}
    </button>
  )
}
