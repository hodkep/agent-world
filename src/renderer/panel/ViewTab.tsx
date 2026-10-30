import { useState } from 'react'
import { isMac, showKey } from '../shortcuts'
import { type HeaderIconName, OutlineIcon } from './IconButton'

/**
 * One tab of the side panel, drawn as its icon. What it is, what it is for and the key that jumps to it show in a card while the pointer or keyboard focus is on it;
 * `number` is its place in the row, which is the digit of Mod+Alt+digit. The card is fixed to the window, since the row scrolls sideways and would cut off one hung under it.
 */
export function ViewTab({ icon, label, name = label, about, number, selected, onClick, badge, dot, keys = [], reveal, mac = isMac() }: { icon: HeaderIconName; label: string; /** What assistive tools and the Playwright specs call it; the label, unless it carries a count or a dot. */ name?: string; about: string; number: number; selected: boolean; onClick: () => void; /** A count on the icon. */ badge?: number; /** A dot on the icon: something is open (`run`) or up (`live`). */ dot?: 'run' | 'live'; /** Keys it has besides the jump, as combos. */ keys?: string[]; /** The folder it shows, for the right-click reveal. */ reveal?: string; mac?: boolean }) {
  const [at, setAt] = useState<{ left: number; top: number } | null>(null)
  const show = (el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    setAt({ left: Math.max(4, Math.min(r.left, window.innerWidth - 264)), top: r.bottom + 6 })
  }
  const combos = [...(number <= 9 ? [`Mod+Alt+${number}`] : []), ...keys]
  return (
    <button
      role="tab"
      className="vt"
      aria-selected={selected}
      aria-label={name}
      data-reveal={reveal}
      onClick={onClick}
      onMouseEnter={(e) => show(e.currentTarget)}
      onMouseLeave={() => setAt(null)}
      onFocus={(e) => show(e.currentTarget)}
      onBlur={() => setAt(null)}
    >
      <OutlineIcon name={icon} size={16} />
      {badge ? <span className="vt-badge" aria-hidden="true">{badge}</span> : null}
      {dot && <span className={`vt-dot ${dot}`} aria-hidden="true" />}
      {at && (
        <span className="vt-tip" role="presentation" style={{ left: at.left, top: at.top }}>
          <b>{label}</b>
          <span>{about}</span>
          {combos.length > 0 && <span className="vt-keys">{combos.map((c) => <kbd key={c}>{showKey(c, mac)}</kbd>)}</span>}
        </span>
      )}
    </button>
  )
}
