import { useEffect, useRef, useState } from 'react'
import type { LibraryItem, PlaybookRule, RuleMode, RuleStrength } from '../../shared/library'
import { PixelIcon, type IconName } from '../chat/PixelIcon'

export const MODE_LABEL: Record<RuleMode, string> = { always: 'Told every time', 'on-demand': 'Pointed at', step: 'By a step', off: 'Off' }
const STRENGTHS: RuleStrength[] = ['soft', 'medium', 'hard']
const MODES: RuleMode[] = ['always', 'on-demand', 'step', 'off']
const ICON: Record<LibraryItem['kind'], IconName> = { skill: 'book', instruction: 'flag', prompt: 'pencil' }

/**
 * One rule of a playbook as a row. The group it sits in already says how it is used, so the row holds only what differs:
 * the name, the sentence for when it applies (edited in place), a three-step firmness gauge, and a menu to move or remove it.
 */
export function LibraryRule({ rule, item, onChange, onRemove }: { rule: PlaybookRule; item: LibraryItem | undefined; onChange: (patch: Partial<PlaybookRule>) => void; onRemove: () => void }) {
  const [menu, setMenu] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  // The "when" is free text that may hold several statements, so its box grows with them instead of scrolling one line.
  const when = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const t = when.current
    if (t) (t.style.height = 'auto', (t.style.height = `${t.scrollHeight}px`))
  }, [rule.when, rule.mode])
  useEffect(() => {
    if (!menu) return
    const away = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setMenu(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), setMenu(false))
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc, true)
    return () => (document.removeEventListener('mousedown', away), document.removeEventListener('keydown', esc, true))
  }, [menu])
  const level = STRENGTHS.indexOf(rule.strength)
  return (
    <div className={`lr${rule.mode === 'off' ? ' off' : ''}`}>
      <span className={`lr-icon ${rule.mode}`}>{item ? <PixelIcon name={ICON[item.kind]} scale={2} /> : null}</span>
      <div className="lr-name">
        <b title={item?.description}>{item?.name ?? `${rule.id} (missing)`}</b>
        {rule.mode === 'on-demand' && <textarea ref={when} rows={1} aria-label={`When to use ${rule.id}`} value={rule.when} placeholder="when does it apply? a request, or something it meets: a merge conflict, failing tests" onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()} onChange={(e) => onChange({ when: e.target.value.replace(/\s*\n\s*/g, ' ') })} />}
      </div>
      {rule.mode !== 'off' && (
        <div className="lr-gauge" role="radiogroup" aria-label={`Firmness of ${rule.id}`}>
          {STRENGTHS.map((s, i) => (
            <button key={s} role="radio" aria-checked={rule.strength === s} aria-label={s} title={s} className={`${i <= level ? 'on' : ''}${rule.strength === 'hard' ? ' hard' : ''}`} onClick={() => onChange({ strength: s })} />
          ))}
          <small>{rule.strength}</small>
        </div>
      )}
      <div className="lr-more" ref={box}>
        <button className="rm" aria-label={`More for ${rule.id}`} aria-haspopup="menu" aria-expanded={menu} title="Move it, or take it out" onClick={() => setMenu((m) => !m)}>⋯</button>
        {menu && (
          <div className="lr-menu" role="menu" aria-label={`Move ${rule.id}`}>
            {MODES.filter((m) => m !== rule.mode).map((m) => (
              <button key={m} role="menuitem" onClick={() => (setMenu(false), onChange({ mode: m }))}>{MODE_LABEL[m]}</button>
            ))}
            <button role="menuitem" className="bad" onClick={() => (setMenu(false), onRemove())}>Remove from playbook</button>
          </div>
        )}
      </div>
    </div>
  )
}
