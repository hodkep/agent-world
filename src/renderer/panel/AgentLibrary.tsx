import { useMemo } from 'react'
import { LibraryOff } from './LibraryOff'
import { PixelIcon, type IconName } from '../chat/PixelIcon'
import { useLibraryUses } from '../chat/LibrarySlips'
import { summaryOf, timeline, type Step } from './libraryTimeline'

const ICON: Record<Step['tone'], IconName> = { told: 'flag', point: 'tag', read: 'book', mute: 'tag' }
const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

/** The agent's Library tab: what it was told on the left, what it did about it on the right, so the gap between them is the page. */
export function AgentLibrary({ agentId, agentName, enabled, onOpenSettings }: { agentId: string; agentName: string; enabled: boolean; onOpenSettings: () => void }) {
  const { uses, items } = useLibraryUses(agentId)
  const name = (id: string) => items.get(id)?.name ?? id
  const steps = useMemo(() => timeline(uses, name), [uses, items]) // eslint-disable-line react-hooks/exhaustive-deps
  const sum = summaryOf(uses)
  const started = uses.findLast((u) => u.how === 'started')
  const pointed = [...new Set(uses.filter((u) => u.how === 'triggered').map((u) => u.id))]
  const told = [...new Set(uses.filter((u) => u.how === 'delivered' && u.launch === started?.launch).map((u) => u.id))]
  if (!enabled) return <LibraryOff onOpenSettings={onOpenSettings} />
  if (!uses.length) return <div className="al"><p className="hint">The library has done nothing for {agentName} yet. It starts with the opening text its playbook gives, then points at items as messages match.</p></div>
  return (
    <div className="al" role="tabpanel" aria-label="Library">
      <p className="al-sum">Told <b>{sum.told} {sum.told === 1 ? 'rule' : 'rules'}</b>, pointed at <b>{sum.pointed} {sum.pointed === 1 ? 'item' : 'items'}</b>, and {agentName} read <b>{sum.read}</b> of them.</p>
      <div className="al-cols">
        <section aria-label="What it was told">
          <h4>What it was told</h4>
          {started && <small className="al-tok">when it started at {clock(started.t)} · about {Math.max(1, Math.ceil((started.words ?? '').length / 4))} tokens</small>}
          <div className="paper"><p className="paper-w">{started?.words ?? ''}</p></div>
          <ul className="al-items">
            {told.map((id) => <li key={id}><b>{name(id)}</b><small>every time</small></li>)}
            {pointed.map((id) => <li key={id}><b>{name(id)}</b><small>pointed at</small></li>)}
          </ul>
        </section>
        <section aria-label="What it did">
          <h4>What it did</h4>
          <small className="al-tok">in order</small>
          <ol className="lib-rail">
            {steps.map((s, k) => (
              <li key={k} className="lib-step">
                <span className={`mk ${s.tone}`}><PixelIcon name={ICON[s.tone]} scale={2} /></span>
                <time>{clock(s.t)}</time>
                <span className="tx"><span>{s.title}</span><small>{s.note}</small></span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  )
}
