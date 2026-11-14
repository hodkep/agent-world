import { Fragment } from 'react'
import type { LibraryItem, SkillUse } from '../../shared/library'
import { sizeText } from '../../shared/size'
import { PixelIcon, type IconName } from '../chat/PixelIcon'
import { spineLook } from './libraryShelf'
import type { ShelfGroup } from './skillGroups'
import { DayStrip } from './SkillBits'

const KIND_ICON: Record<LibraryItem['kind'], IconName> = { skill: 'book', instruction: 'flag', prompt: 'pencil' }
const size = (bytes: number | undefined, measured = true) => (bytes === undefined ? '…' : `${sizeText(bytes)}${measured ? '' : '+'}`)

/**
 * The skills as panels, one for each place they live in: a heading with the place and what it takes, then a calm row for each skill (its name, one line about it, its size).
 * What was found but is not in the library is dimmed at the end. Instructions and prompts follow in a panel of their own.
 */
export function SkillShelf({ groups, others, open, live, onOpen, uses }: { groups: ShelfGroup[]; others: LibraryItem[]; open: string | null; live: Set<string>; onOpen: (key: string) => void; /** For the skills in use or resting: each one's use and what it is for, shown in place of its size. */ uses?: Record<string, { use?: SkillUse; description: string }> }) {
  return (
    <section className="drawer sk2" aria-label="Items">
      <div className="sk2-list lib-scrollbar">
        {groups.map((g) => (
          <div key={g.key} className="sk2-pnl" role="group" aria-label={g.title}>
            <div className="sk2-grp">
              <b>{g.title}</b>
              <span className="sk2-path" title={g.path}>{g.path}</span>
              <span className="sk2-tot">{g.kind === 'found' ? g.rows.length : size(g.measured || g.bytes ? g.bytes : undefined, g.measured)}</span>
            </div>
            {g.rows.map((r, n) => (
              <Fragment key={r.key}>
              {r.creator && (g.rows[n - 1]?.creator?.name !== r.creator.name || g.rows[n - 1]?.creator?.detail !== r.creator.detail) && (
                <div className="sk2-cr"><b>{r.creator.name}</b><span>{r.creator.detail}</span><span className="sk2-tot">{g.rows.filter((x) => x.creator?.name === r.creator!.name && x.creator?.detail === r.creator!.detail).length}</span></div>
              )}
              <button className={`sk2-row${r.logo ? ' lg' : ''}${open === r.key ? ' sel' : ''}${r.found ? ' found' : ''}${live.has(r.key) ? ' live' : ''}`} aria-label={`Open ${r.name}`} aria-pressed={open === r.key} onClick={() => onOpen(r.key)}>
                {r.logo ? <img className="sk2-logo" src={r.logo} alt="" style={{ '--c': spineLook({ name: r.name, tokens: { description: 0, body: 0 } }, true).colour } as React.CSSProperties} /> : <span className="sk2-spine" style={{ background: spineLook({ name: r.name, tokens: { description: 0, body: 0 } }, true).colour }} aria-hidden />}
                {uses ? (() => {
                  const u = uses[r.key]
                  return (
                    <>
                      <span className="sk2-main"><b>{r.name}</b><small className={r.warn ? 'bad' : ''} title={u?.description}>{r.warn ?? u?.description}</small></span>
                      <span className="sk2-usage">{!!u?.use?.used && <DayStrip days={u.use.days} />}<span className={`sk2-n${u?.use?.used ? '' : ' none'}`}>{u?.use?.used ? `${u.use.used}×` : '—'}</span></span>
                    </>
                  )
                })() : (
                  <>
                    <span className="sk2-main"><b>{r.name}</b>{(r.warn || !r.creator) && <small className={r.warn ? 'bad' : ''}>{r.warn ?? r.fact}</small>}</span>
                    <span className={`sk2-size${(r.bytes ?? 0) >= 1024 ** 3 ? ' big' : ''}`}>{r.found ? '' : size(r.bytes)}</span>
                  </>
                )}
                {live.has(r.key) && <span className="sk2-plus" aria-hidden>+1</span>}
              </button>
              </Fragment>
            ))}
          </div>
        ))}
        {others.length > 0 && (
          <div className="sk2-pnl" role="group" aria-label="Instructions and prompts">
            <div className="sk2-grp"><b>Instructions and prompts</b><span className="sk2-path">kept in the library</span><span className="sk2-tot">{others.length}</span></div>
            {others.map((i) => (
              <button key={i.id} className={`sk2-row${open === i.id ? ' sel' : ''}`} aria-label={`Open ${i.name}`} aria-pressed={open === i.id} title={i.description} onClick={() => onOpen(i.id)}>
                <span className="sk2-spine" style={{ background: spineLook(i, true).colour }} aria-hidden><PixelIcon name={KIND_ICON[i.kind]} scale={1} /></span>
                <span className="sk2-main"><b>{i.name}</b><small>{i.kind} · {i.description}</small></span>
                <span className="sk2-size">{i.tokens.body} tok</span>
              </button>
            ))}
          </div>
        )}
        {groups.length === 0 && others.length === 0 && <p className="hint">Nothing matches.</p>}
      </div>
    </section>
  )
}
