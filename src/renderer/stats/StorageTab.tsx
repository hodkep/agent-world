import { useEffect, useState } from 'react'
import { sizeText } from '../../shared/size'
import { recommend, type Place, type Storage } from '../../shared/storage'
import { treemap } from '../../shared/treemap'

/** The map is laid out as if 800 by 260 and placed in percent, so it follows the window; a tile under this share of the whole is too small to read or press and is folded into one. */
const MAP_W = 800
const MAP_H = 260
const FOLD = 0.02
/** The folded tile is given at least this share, so its label has room. A tile narrower than WIDE (px) shows no label, only its title. */
const MORE_MIN = 0.06
const WIDE = 48
/** A tile shows its size too when it is at least this tall (px). */
const TALL = 40

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
  // Tiles under a small share of the whole are one tile; the open one always keeps its own, with at least that share, so it can be seen and pressed.
  const sum = Math.max(1, blocks.reduce((n, b) => n + b.bytes, 0))
  const small = (b: Storage) => b !== open && b.bytes / sum < FOLD
  const folded = blocks.filter(small)
  const foldedBytes = folded.reduce((n, b) => n + b.bytes, 0)
  const tiles: ({ b: Storage } | { more: true })[] = [...blocks.filter((b) => !small(b)).map((b) => ({ b })), ...(folded.length ? [{ more: true as const }] : [])]
  const value = (t: (typeof tiles)[number]) => ('b' in t ? Math.max(t.b.bytes, sum * FOLD) : Math.max(foldedBytes, sum * MORE_MIN))
  tiles.sort((x, y) => value(y) - value(x))
  const rects = treemap(tiles.map(value), MAP_W, MAP_H)
  const tileAt = (i: number) => ({ left: `${(rects[i]!.x / MAP_W) * 100}%`, top: `${(rects[i]!.y / MAP_H) * 100}%`, width: `${(rects[i]!.w / MAP_W) * 100}%`, height: `${(rects[i]!.h / MAP_H) * 100}%` })
  return (
    <section className="sg">
      <p className="sg-meta">
        {r.measuring ? 'Measuring… the first time takes a minute.' : r.at ? `Measured ${ago(r.at, now)}` : 'Not measured yet'}
        <button type="button" className="sg-again" disabled={r.measuring} onClick={() => void window.aw.measureStorage()}>Measure again</button>
      </p>
      {tiles.length > 0 && (
        <div className="sg-map" style={{ height: MAP_H }}>
          {tiles.map((t, i) => {
            const tall = rects[i]!.h >= TALL && rects[i]!.w >= WIDE
            const wide = rects[i]!.w >= WIDE
            if (!('b' in t)) return <div key="more" className={`sg-more${wide ? '' : ' bare'}`} style={tileAt(i)} title={`${folded.map((b) => b.name).join(', ')}`}><span>{folded.length} smaller</span>{tall && <small>{sizeText(foldedBytes)}</small>}</div>
            const b = t.b
            return (
              <button key={b.path} type="button" className={`sg-block${b === open ? ' on' : ''}${i >= 2 ? ' dim' : ''}${wide ? '' : ' bare'}`} aria-pressed={b === open} aria-label={`${b.name}, ${sizeText(b.bytes)}`} title={`${b.name} · ${sizeText(b.bytes)}`} style={{ ...tileAt(i), ['--t' as string]: `${Math.max(44, 100 - i * 11)}%` }} onClick={() => setPick(b.path)}>
                <span>{b.name}</span>
                {tall && <small>{sizeText(b.bytes)}</small>}
              </button>
            )
          })}
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
