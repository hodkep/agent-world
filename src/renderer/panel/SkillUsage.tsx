import type { LibraryItem, SkillUse } from '../../shared/library'
import { ago } from './addressHistory'
import { dustOf, splitUsage } from './libraryUsage'
import { spineLook } from './libraryShelf'
import { CostMeter, Heads } from './SkillBits'

/** The Usage tab's skills: a ranking of those used in the last 30 days, those gathering dust with what they cost, and which agent reached for what. */
export function SkillUsage({ items, usage, claudeOff, named, busy, onClaude, onClear, onRemove }: { items: LibraryItem[]; usage: Record<string, SkillUse>; claudeOff: string[]; named: Set<string>; busy: boolean; onClaude: (id: string, on: boolean) => void; onClear: (ids: string[]) => void; onRemove: (id: string) => void }) {
  const now = Date.now()
  const split = splitUsage(items, usage, claudeOff)
  const { used, unused } = split
  const dust = dustOf(split, named)
  const top = used[0]?.use.used ?? 1
  const loads = used.reduce((n, r) => n + r.use.used, 0)
  const cost = [...used, ...unused].filter((r) => r.on).reduce((n, r) => n + r.item.tokens.description, 0)
  // Who reached for what: each agent with the skills it used, most active first.
  const agents = new Map<string, { name: string; skills: LibraryItem[] }>()
  for (const { item, use } of used) for (const w of use.who) {
    const a = agents.get(w.id) ?? { name: w.name, skills: [] }
    a.skills.push(item)
    agents.set(w.id, a)
  }
  const crew = [...agents.entries()].sort((a, b) => b[1].skills.length - a[1].skills.length || a[1].name.localeCompare(b[1].name))
  return (
    <section className="sku" aria-label="Skills in the last 30 days">
      <div className="sku-top">
        <b>Last 30 days</b>
        <span className="hint">{loads} {loads === 1 ? 'load' : 'loads'} · {used.length} of {used.length + unused.length} skills used</span>
        <span className="lib-sp" />
        <span className="hint">start-of-session cost</span>
        <CostMeter tokens={cost} unused={dust.saves} />
      </div>
      <div className="sku-grid">
        <div className="sku-col">
          <div role="group" aria-label="Used in 30 days">
            <h4>Most used</h4>
            {used.length === 0 && <p className="hint">No skill was loaded or read in the last 30 days.</p>}
            {used.map(({ item, use }, n) => (
              <div key={item.id} className={`sku-rank${n === 0 ? ' first' : ''}`}>
                <span className="sku-pos">#{n + 1}</span>
                <span className="sku-spine" style={{ background: spineLook(item).colour }} aria-hidden />
                <span className="sku-who"><b>{item.name}</b><small><Heads who={use.who} />last used {ago(use.last, now)}{use.accounts.length ? ` · ${use.accounts.join(', ')}` : ''}</small></span>
                <span className="sku-bar" aria-hidden><i style={{ width: `${Math.max(4, Math.round((use.used / top) * 100))}%` }} /></span>
                <span className="sku-n" aria-label={`${item.name} used ${use.used} times`}>{use.used}×</span>
              </div>
            ))}
          </div>
          <div role="group" aria-label="Not used in 30 days">
            <h4>Gathering dust · {unused.length}{dust.saves ? ` · ${dust.saves} tok every session` : ''}</h4>
            {unused.length === 0 && <p className="hint">Every skill was used.</p>}
            {unused.map(({ item, use, on }) => (
              <div key={item.id} className="sku-rank dusty">
                <span className="sku-pos">—</span>
                <span className="sku-spine" style={{ background: spineLook(item).colour }} aria-hidden />
                <span className="sku-who"><b>{item.name}</b><small>{use.last ? `last used ${ago(use.last, now)}` : 'never used'}{on ? ` · ${item.tokens.description} tok every session` : ' · off for Claude'}</small></span>
                <button disabled={busy} onClick={() => onClaude(item.id, !on)}>{on ? 'Turn off for Claude' : 'Turn on for Claude'}</button>
                <button className="ghost" disabled={busy} onClick={() => onRemove(item.id)}>Remove</button>
              </div>
            ))}
            {dust.ids.length > 0 && (
              <div className="sku-dust">
                <span>Turn off {dust.ids.length === 1 ? 'it' : `all ${dust.ids.length}`} for Claude and save {dust.saves} tokens at the start of every session. Each can be turned back on.</span>
                <button className="primary" disabled={busy} onClick={() => onClear(dust.ids)}>Clear the dust</button>
              </div>
            )}
          </div>
        </div>
        <div className="sku-col sku-crew" role="group" aria-label="Who reached for what">
          <h4>Who reached for what</h4>
          {crew.length === 0 && <p className="hint">No agent used a skill in the last 30 days.</p>}
          {crew.map(([id, a]) => (
            <div key={id} className="sku-ag">
              <Heads who={[{ id, name: a.name }]} />
              <b>{a.name}</b>
              <span className="sku-ag-skills">{a.skills.map((s) => <span key={s.id} className="sku-spine sm" title={s.name} style={{ background: spineLook(s).colour }} />)}</span>
              <small>{a.skills.length} {a.skills.length === 1 ? 'skill' : 'skills'}</small>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
