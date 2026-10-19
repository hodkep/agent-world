import type { CSSProperties } from 'react'
import { identicon } from '../../shared/identicon'

/** A name's own little pixel picture (the same every time), used where a project or an agent needs a face. */
export function Identicon({ name, size = 40 }: { name: string; size?: number }) {
  const { cells, color } = identicon(name)
  return (
    <span className="identicon" style={{ width: size, height: size, '--c': color } as CSSProperties} aria-hidden="true">
      {cells.map((on, i) => (
        <i key={i} className={on ? 'on' : ''} />
      ))}
    </span>
  )
}
