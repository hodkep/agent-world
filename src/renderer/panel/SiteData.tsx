import { useCallback, useEffect, useRef, useState } from 'react'
import type { PreviewSites } from '../../shared/api'
import { OutlineIcon } from './IconButton'
import { hostOf } from './previewSites'

const NONE: PreviewSites = { current: null, others: [] }
const cookies = (n: number) => (n === 0 ? 'No cookies' : `${n} cookie${n === 1 ? '' : 's'}`)

/**
 * What the Preview's one session keeps, for the page being shown and for every other site, with a Clear for each and one for all.
 * The session is the same for every agent and every project, and it is kept between runs, so this is where a login is taken back.
 */
export function SiteData({ page, loading = false }: { page: string; /** True while the page loads: the cookies it sets are looked at again when it is done. */ loading?: boolean }) {
  const host = hostOf(page)
  const [open, setOpen] = useState(false)
  const [asking, setAsking] = useState(false)
  const [cleared, setCleared] = useState<'yes' | 'failed' | null>(null)
  const [sites, setSites] = useState(NONE)
  const wrap = useRef<HTMLSpanElement>(null)
  const load = useCallback(() => window.aw.previewSites(host || undefined).then(setSites, () => undefined), [host])
  useEffect(() => void load(), [load, open, loading])
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), setOpen(false))
    window.addEventListener('mousedown', away)
    window.addEventListener('keydown', esc, true)
    return () => {
      window.removeEventListener('mousedown', away)
      window.removeEventListener('keydown', esc, true)
    }
  }, [open])
  const done = (clear: Promise<void>) => void clear.then(() => (setCleared('yes'), setAsking(false), load()), () => setCleared('failed'))
  const { current, others } = sites
  const any = (current?.cookies ?? 0) > 0 || others.length > 0
  return (
    <span className="preview-dev" ref={wrap}>
      <button className={`sd-btn${current && current.cookies > 0 ? ' has-data' : ''}`} aria-haspopup="dialog" aria-expanded={open} aria-label="Site data" title="Site data: the logins and cookies the Preview keeps for sites, shared by every agent" onClick={() => (setOpen((o) => !o), setAsking(false), setCleared(null))}>
        <OutlineIcon name="data" />
        {current && current.cookies > 0 && <i className="sd-dot" aria-hidden="true" />}
      </button>
      {open && (
        <div className="sd-menu" role="dialog" aria-label="Site data">
          {current && (
            <div className="sd-here">
              <b>{current.host}</b>
              <button onClick={() => done(window.aw.clearPreviewSite(current.host))}>Clear</button>
              <small>{current.cookies > 0 ? `${cookies(current.cookies)} · and its local storage` : `${cookies(0)} · clearing also removes local storage`}</small>
            </div>
          )}
          {others.length > 0 && <h5>Other sites</h5>}
          {others.map((s) => (
            <div key={s.host} className="sd-row">
              <span>{s.host}</span>
              <small>{s.cookies}</small>
              <button onClick={() => done(window.aw.clearPreviewSite(s.host))}>Clear</button>
            </div>
          ))}
          {!current && !any && <p className="sd-none">No cookies stored.</p>}
          {cleared && <p className="sd-note" role="status">{cleared === 'yes' ? 'Cleared. Pages that are open keep showing until they are reloaded.' : 'Could not clear that site. Nothing was changed.'}</p>}
          {asking ? (
            <div className="sd-ask" role="alert">
              <span>
                <b>Clear all site data?</b> Every agent is logged out of every site.
              </span>
              <button className="danger" onClick={() => done(window.aw.clearPreviewSites())}>Clear all</button>
              <button onClick={() => setAsking(false)}>Keep</button>
            </div>
          ) : (
            any && (
              <div className="sd-foot">
                <span>Shared by every agent</span>
                <button onClick={() => setAsking(true)}>Clear all…</button>
              </div>
            )
          )}
        </div>
      )}
    </span>
  )
}
