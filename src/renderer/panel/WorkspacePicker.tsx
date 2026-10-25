import { useEffect, useMemo, useRef, useState } from 'react'
import type { WorkspaceInfo, Workspaces } from '../../shared/api'
import { PixelWord } from '../PixelWord'

/** The folders just above a project, which tell two projects with the same name apart; the whole path is in the tooltip. */
const parentOf = (path: string) => {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return `${parts.length > 3 ? '…/' : '/'}${parts.slice(-3, -1).join('/')}`
}
const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7)
const RUGS = ['#3b5b8a', '#7a3b4a', '#3f6b57', '#6b4f8f', '#8a6b2e']
const DESKS = [2, 9, 16, 23].flatMap((x) => [5, 11].map((y) => [x, y] as const)).sort((a, b) => a[1] - b[1] || a[0] - b[0])

/** A little floor plan for a project: a desk per agent that is working there, lit when it has one, and a rug colour only this path gets. */
function FloorThumb({ path, agents }: { path: string; agents: number }) {
  const url = useMemo(() => {
    const W = 32
    const H = 18
    const seed = hash(path)
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    const g = c.getContext('2d')!
    const fill = (color: string, x: number, y: number, w: number, h: number) => ((g.fillStyle = color), g.fillRect(x, y, w, h))
    for (let y = 0; y < H; y++) fill(y % 2 ? '#7a4c2b' : '#8e5b34', 0, y, W, 1)
    fill('#2c3350', 0, 0, W, 4)
    fill('#08070c', 0, 3, W, 1)
    // Bookshelves on the back wall, somewhere different on every floor.
    for (let i = 0; i < 2; i++) fill(i ? '#6ad0e0' : '#f2c230', 2 + ((seed >> (i * 5)) % 24), 1, 3, 2)
    fill(RUGS[seed % RUGS.length]!, 6, 8, 20, 3)
    DESKS.forEach(([x, y], i) => {
      fill('#08070c', x, y, 6, 3)
      fill('#b07a46', x + 1, y + 1, 4, 1)
      fill(i < agents ? '#6ad0e0' : '#3a3850', x + 2, y, 2, 1)
    })
    return c.toDataURL()
  }, [path, agents])
  return <img className="floor-thumb" src={url} width={160} height={90} alt="" />
}

/**
 * What a window shows when it has no project yet: every project the office has worked in as a floor to walk onto,
 * and a way to open another folder. Other windows are not affected by what is picked here.
 */
export function WorkspacePicker({ workspaces, onOpen, onPick, onForget }: { workspaces: Workspaces; onOpen: (path: string) => void; onPick: () => void; onForget: (path: string) => void }) {
  const [filter, setFilter] = useState('')
  const grid = useRef<HTMLUListElement>(null)
  const items = workspaces.items.filter((w) => `${w.name} ${w.path}`.toLowerCase().includes(filter.trim().toLowerCase()))
  const many = workspaces.items.length > 6
  const buttons = () => [...(grid.current?.querySelectorAll<HTMLButtonElement>('button.floor:not(:disabled), button.floor-new') ?? [])]

  useEffect(() => {
    if (many) return
    buttons()[0]?.focus()
  }, [many])

  const open = (w: WorkspaceInfo) => w.exists && onOpen(w.path)
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement && e.key !== 'ArrowDown') return
    const digit = /^[1-9]$/.test(e.key) ? Number(e.key) - 1 : -1
    if (digit >= 0 && items[digit]) return (e.preventDefault(), open(items[digit]!))
    const els = buttons()
    const at = els.indexOf(document.activeElement as HTMLButtonElement)
    const cols = getComputedStyle(grid.current!).gridTemplateColumns.split(' ').length
    const to = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key]
    if (to === undefined) return
    e.preventDefault()
    els[Math.max(0, Math.min(els.length - 1, (at < 0 ? -to : at) + to))]?.focus()
  }

  return (
    <div className="lobby" role="dialog" aria-modal="true" aria-label="Choose a project for this window" onKeyDown={onKeyDown}>
      <div className="lobby-inner">
        <PixelWord text="choose a floor" scale={4} />
        <p className="lobby-lead">Each project is a floor of the office. Pick where this window works; your other windows keep their own floor.</p>
        {many && <input className="lobby-filter" autoFocus value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find a project…" aria-label="Find a project" />}
        <ul className="floors" ref={grid} aria-label="Projects">
          {items.map((w, i) => (
            <li key={w.path} className={w.exists ? '' : 'gone'} data-reveal={w.exists ? w.path : undefined}>
              <button className="floor" onClick={() => open(w)} disabled={!w.exists} title={w.exists ? w.path : `${w.path} (missing)`}>
                <FloorThumb path={w.path} agents={w.agents} />
                {i < 9 && <kbd className="floor-key" aria-hidden="true">{i + 1}</kbd>}
                <span className="floor-name">{w.name}</span>
                <span className="floor-path">{w.exists ? parentOf(w.path) : 'folder is missing'}</span>
                <span className="floor-tags">
                  <span className={`ws-tag ${w.git ? 'git' : ''}`}>{w.git ? 'git' : 'no git'}</span>
                  {w.agents > 0 && <span className="ws-tag">{w.agents} agent{w.agents === 1 ? '' : 's'} at work</span>}
                </span>
              </button>
              {(w.saved || !w.exists) && <button className="ws-forget floor-forget" onClick={() => onForget(w.path)} aria-label={`${w.exists ? 'Forget' : 'Remove'} ${w.name}`} title={w.exists ? 'Forget this project (nothing on disk is deleted)' : 'Remove this project and the agents that worked in it (its folder is gone)'} />}
            </li>
          ))}
          <li>
            <button className="floor-new" onClick={onPick}>
              <span className="floor-plus" aria-hidden="true" />
              <span className="floor-name">Open a folder</span>
              <span className="floor-path">Start a new floor</span>
            </button>
          </li>
        </ul>
        {filter && items.length === 0 && <p className="lobby-lead">No project matches “{filter}”.</p>}
        <p className="lobby-hint">Arrow keys to move · Enter to open{items.length > 0 ? ` · 1–${Math.min(9, items.length)} to jump` : ''}</p>
      </div>
    </div>
  )
}
