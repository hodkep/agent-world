import { useEffect, useState } from 'react'
import { sizeText } from '../../shared/size'
import { recommend, type Place, type Storage } from '../../shared/storage'

type Report = Awaited<ReturnType<Window['aw']['storageReport']>>

const ago = (at: number, now: number) => {
  const m = Math.max(0, Math.round((now - at) / 60_000))
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`
}

/**
 * What each workspace takes on disk, as a map of blocks (area is size) with the chosen one's places listed under it: the project's folder,
 * each agent's worktree, a subagent under its parent, and folders no agent owns. Measured in the background (see main/storage.ts); the lines
 * under "Could free" only say where to clear something, nothing here deletes.
 */
export function StorageTab({ now }: { now: number }) {
  const [r, setR] = useState<Report | null>(null)
  const [pick, setPick] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    const load = () => window.aw.storageReport().then((x) => (live && setR(x), x))
    // Nothing was ever measured: start now, so the first look is not an empty screen.
    void load().then((x) => x.at === null && !x.measuring && void window.aw.measureStorage())
    const off = window.aw.onStorage(() => void load())
    return () => (live = false, off())
  }, [])
  if (!r) return <p className="st-note">Loading…</p>
  const blocks = [...r.workspaces, ...(r.data ? [r.data] : [])].sort((a, b) => b.bytes - a.bytes)
  const open = blocks.find((b) => b.path === pick) ?? blocks.find((b) => b.path === r.active) ?? blocks[0]
  const [big, ...rest] = blocks
  const total = rest.reduce((n, b) => n + b.bytes, 0)
  const block = (b: Storage, i: number) => (
    <button key={b.path} type="button" className={`sg-block${b === open ? ' on' : ''}${i >= 2 ? ' dim' : ''}`} aria-pressed={b === open} style={{ flex: Math.max(b.bytes, 1), ['--t' as string]: `${[100, 80, 62, 48][Math.min(i, 3)]}%` }} onClick={() => setPick(b.path)}>
      <span>{b.name}</span>
      <small>{sizeText(b.bytes)}</small>
    </button>
  )
  return (
    <section className="sg">
      <p className="sg-meta">
        {r.measuring ? 'Measuring… the first time takes a minute.' : r.at ? `Measured ${ago(r.at, now)}` : 'Not measured yet'}
        <button type="button" className="sg-again" disabled={r.measuring} onClick={() => void window.aw.measureStorage()}>Measure again</button>
      </p>
      {big && (
        <div className="sg-map">
          {block(big, 0)}
          {rest.length > 0 && <div className="sg-col" style={{ flex: Math.max(total, 1) }}>{rest.map((b, i) => block(b, i + 1))}</div>}
        </div>
      )}
      {open && <Places s={open} />}
    </section>
  )
}

function Places({ s }: { s: Storage }) {
  const top = Math.max(1, ...s.places.map((p) => p.bytes))
  const tips = s.places.some((p) => p.kind !== 'data') ? recommend(s) : []
  const ids = new Set(s.places.map((p) => p.id))
  const row = (p: Place) => (
    <div key={p.id} className={`sg-row${p.of && ids.has(p.of) ? ' in' : ''}${p.kind === 'orphan' ? ' orphan' : ''}`}>
      <div className="sg-n">{p.name}{p.note && <small>{p.note}</small>}</div>
      <div className="sg-t" aria-hidden>{p.bytes > 0 && <i style={{ width: `${Math.max(1, (p.bytes / top) * 100)}%` }} />}</div>
      <b>{p.bytes > 0 ? sizeText(p.bytes) : '—'}</b>
    </div>
  )
  return (
    <>
      <h3 className="sg-h">{s.name} <small>{sizeText(s.bytes)}</small></h3>
      {s.places.map(row)}
      {tips.length > 0 && (
        <div className="sg-free">
          <h3>Could free</h3>
          {tips.map((t, i) => (
            <p key={i}>
              <b>{sizeText(t.bytes)}</b>
              {t.text}
              {t.cmd && <> <code>{t.cmd}</code></>}
            </p>
          ))}
        </div>
      )}
    </>
  )
}
