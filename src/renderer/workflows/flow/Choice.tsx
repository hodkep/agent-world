import { useEffect, useRef, useState } from 'react'
import { PixelIcon } from '../../chat/PixelIcon'

/** A dropdown the app draws (the system one cannot be styled): the chosen option on a button, a list of all of them under it, closed by Escape or a press outside. */
export function Choice({ ariaLabel, value, options, onChange }: { ariaLabel: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', key)
    }
  }, [open])
  const chosen = options.find((o) => o.value === value)
  return (
    <div className="ch" ref={root}>
      <button type="button" className={`ch-btn ${open ? 'open' : ''}`} aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>{chosen?.label ?? value}</span>
        <PixelIcon name="chevron" scale={2} />
      </button>
      {open && (
        <ul className="ch-list" role="listbox" aria-label={ariaLabel}>
          {options.map((o) => (
            <li key={o.value} role="option" aria-selected={o.value === value} className={o.value === value ? 'on' : ''} onClick={() => (onChange(o.value), setOpen(false))}>
              <span>{o.label}</span>
              {o.value === value && <PixelIcon name="check" scale={2} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
