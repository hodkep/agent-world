import type { LibraryItem, SkillUse } from '../../shared/library'
import { ago } from './addressHistory'
import { splitUsage } from './libraryUsage'

/** The Usage tab's skills: bars for those used in the last 30 days, and beside them those that were not, with what they cost and what to do about them. */
export function SkillUsage({ items, usage, claudeOff, busy, onClaude, onRemove }: { items: LibraryItem[]; usage: Record<string, SkillUse>; claudeOff: string[]; busy: boolean; onClaude: (id: string, on: boolean) => void; onRemove: (id: string) => void }) {
  const now = Date.now()
  const { used, unused, unusedCost } = splitUsage(items, usage, claudeOff)
  const top = used[0]?.use.used ?? 1
  const who = (u: SkillUse) => [u.agents.join(', '), u.accounts.join(', ')].filter(Boolean).join(' · ')
  return (
    <section className="sku" aria-label="Skills in the last 30 days">
      <p className="hint lib-sum">
        Skills in the last 30 days · {used.length + unused.length} {used.length + unused.length === 1 ? 'skill' : 'skills'} · {used.length} used · {unused.length} not used
        {unusedCost > 0 && <>, costing about {unusedCost} tokens at the start of every session</>}
      </p>
      <div className="sku-grid">
        <div className="sku-box" role="group" aria-label="Used in 30 days">
          <h4>Used in 30 days</h4>
          {used.length === 0 && <p className="hint">No skill was loaded or read in the last 30 days.</p>}
          {used.map(({ item, use }) => (
            <div key={item.id} className="sku-row">
              <span><b>{item.name}</b><small>{[who(use), `last used ${ago(use.last, now)}`].filter(Boolean).join(' · ')}</small></span>
              <span className="sku-bar" aria-hidden><i style={{ width: `${Math.max(4, Math.round((use.used / top) * 100))}%` }} /></span>
              <span className="sku-n" aria-label={`${item.name} used ${use.used} times`}>{use.used}×</span>
              <span className="sku-tok">{item.tokens.description} tok</span>
            </div>
          ))}
        </div>
        <div className="sku-box" role="group" aria-label="Not used in 30 days">
          <h4>Not used in 30 days · {unused.length}</h4>
          {unused.length === 0 && <p className="hint">Every skill was used.</p>}
          {unused.map(({ item, use, on }) => (
            <div key={item.id} className="sku-row">
              <span><b>{item.name}</b><small>{item.description} · {use.last ? `last used ${ago(use.last, now)}` : 'never used'}{on ? ` · ${item.tokens.description} tokens every session` : ' · off for Claude'}</small></span>
              <button disabled={busy} onClick={() => onClaude(item.id, !on)}>{on ? 'Turn off for Claude' : 'Turn on for Claude'}</button>
              <button disabled={busy} onClick={() => onRemove(item.id)}>Remove</button>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
