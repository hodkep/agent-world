import { Fragment, type ReactNode } from 'react'
import { isMac } from '../shortcuts'

export interface Tile {
  id: string
  group?: string
  /** What the strip says under the tiles for the one it is on. */
  line: string
  /** The tile's inside, drawn as the dropdowns draw theirs. */
  body: ReactNode
  cls?: string
}

/** The bar that shows while the switch key is held: the tiles in the order the dropdown lists them, and the one a release would switch to. */
export function Switcher({ title, tiles, at, kind, onPick }: { title: string; tiles: Tile[]; at: string | null; kind: 'agents' | 'spaces'; onPick: (id: string) => void }) {
  const mac = isMac()
  const on = tiles.find((t) => t.id === at)
  const agents = kind === 'agents'
  return (
    <div className="sb-dim">
      <section className="sb" aria-label={title}>
        <div className="sb-cap">
          <span>{title}</span>
          <span>recent first</span>
        </div>
        <div className="sb-tiles">
          {tiles.map((t, i) => (
            <Fragment key={t.id}>
              {t.group && t.group !== tiles[i - 1]?.group && <div className="group-head sb-group">{t.group}</div>}
              <div className="wt-cell sb-cell">
                // Pressed, not clicked: with Ctrl held a Mac sends no click.
                <div className={`wt ${t.cls ?? ''} ${t.id === at ? 'on' : ''}`} data-tile={t.id} aria-current={t.id === at} onMouseDown={() => onPick(t.id)}>
                  {t.body}
                </div>
              </div>
            </Fragment>
          ))}
        </div>
        <div className="sb-line" role="status">
          {on?.line}
        </div>
        <div className="sb-keys">
          <span>
            <kbd>{agents ? 'Tab' : ']'}</kbd> next
          </span>
          <span>
            <kbd>{agents ? '⇧Tab' : '['}</kbd> back
          </span>
          <span>
            release <kbd>{agents ? (mac ? '⌃' : 'Ctrl') : mac ? '⇧⌘' : 'Shift+Ctrl'}</kbd> to switch
          </span>
          <span>
            <kbd>Esc</kbd> stay
          </span>
        </div>
      </section>
    </div>
  )
}
