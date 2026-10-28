import { useRef, useState } from 'react'
import { useDismiss } from '../useDismiss'
import { chipsOf, type RepoInfo } from './repoChips'

/** The repositories of a folder that holds several: a chip each for up to four, the rest in a menu with a filter. The picked one always has a chip. */
export function RepoStrip({ repos, picked, onPick }: { repos: RepoInfo[]; picked: string; onPick: (name: string) => void }) {
  const { shown, more } = chipsOf(repos, picked)
  const [open, setOpen] = useState(false)
  const [find, setFind] = useState('')
  const box = useRef<HTMLSpanElement>(null)
  useDismiss(box, open, () => setOpen(false))
  const row = (r: RepoInfo) => (
    <>
      <i>⎇ {r.branch || 'no commits'}</i>
      {r.dirty > 0 && <span className="n" title={`${r.dirty} uncommitted`}>{r.dirty}</span>}
    </>
  )
  const found = more.filter((r) => r.name.toLowerCase().includes(find.trim().toLowerCase()))
  return (
    <div className="repos" role="group" aria-label="Repositories in this folder">
      {shown.map((r) => (
        <button key={r.name} className={`chip name${r.name === picked ? ' on' : ''}`} aria-pressed={r.name === picked} title={r.name} onClick={() => onPick(r.name)}>
          <span>{r.name}</span>
          {row(r)}
        </button>
      ))}
      {more.length > 0 && (
        <span className="more" ref={box}>
          <button className="chip" aria-expanded={open} aria-haspopup="true" onClick={() => (setOpen(!open), setFind(''))}>+{more.length} more ▾</button>
          {open && (
            <div className="pop">
              <input autoFocus value={find} onChange={(e) => setFind(e.target.value)} placeholder="Filter repositories" aria-label="Filter repositories" />
              {found.map((r) => (
                <button key={r.name} className="r" title={r.name} onClick={() => (onPick(r.name), setOpen(false))}>
                  <b>{r.name}</b>
                  {row(r)}
                </button>
              ))}
              {found.length === 0 && <div className="r">No repository matches</div>}
            </div>
          )}
        </span>
      )}
    </div>
  )
}
