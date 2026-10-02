import { useEffect, useState } from 'react'
import type { SubagentInfo } from '../../shared/chat'
import { Modal } from '../panel/Modal'
import { CrewPanel } from './Crew'
import { crewCounts } from './crewRows'

/** Every main agent's subagents together: a group for each agent that has any, the same rows as the delegation card. */
export function CrewView({ agents, waitingOf, onOpen, onClose }: { agents: { id: string; name: string }[]; waitingOf: (id: string) => Set<string>; onOpen: (id: string) => void; onClose: () => void }) {
  const [all, setAll] = useState<Record<string, SubagentInfo[]>>({})
  const [now, setNow] = useState(Date.now())
  const key = agents.map((a) => a.id).join(',')
  useEffect(() => {
    let alive = true
    const look = () =>
      void Promise.all(agents.map((a) => window.aw.subagents(a.id).then((l) => [a.id, l] as const, () => [a.id, [] as SubagentInfo[]] as const))).then((rows) => alive && (setAll(Object.fromEntries(rows)), setNow(Date.now())))
    look()
    const t = setInterval(look, 1500)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [key])
  const groups = agents
    .map((a) => ({ a, infos: all[a.id] ?? [], waiting: waitingOf(a.id) }))
    .filter((g) => g.infos.length > 0)
    .map((g) => ({ ...g, c: crewCounts(g.infos, now) }))
    .sort((x, y) => Number(y.waiting.size > 0) - Number(x.waiting.size > 0) || y.c.working - x.c.working || x.a.name.localeCompare(y.a.name))
  const working = groups.reduce((n, g) => n + g.c.working, 0)
  const total = groups.reduce((t, g) => ({ done: t.done + g.c.done, stopped: t.stopped + g.c.stopped }), { done: 0, stopped: 0 })
  return (
    <Modal label="Subagents" className="crew-dialog stats" onClose={onClose}>
      <header className="settings-head">
        <b>Subagents</b>
        <span className="st-nav">
          <button onClick={onClose} aria-label="Close">×</button>
        </span>
      </header>
      <div className="st-body">
        <div className="st-cards three">
          <div className="st-card"><span>Working</span><b>{working}</b><small>{groups.length ? `across ${groups.length} ${groups.length === 1 ? 'agent' : 'agents'}` : 'none started yet'}</small></div>
          <div className="st-card"><span>Done</span><b>{total.done}</b><small>reported back</small></div>
          <div className="st-card"><span>Stopped</span><b>{total.stopped}</b><small>ended early</small></div>
        </div>
        {groups.length === 0 ? (
          <p className="st-note">No agent has started subagents in this session yet.</p>
        ) : (
          <div className="crew-groups">
            {groups.map((g) => (
              <div key={g.a.id} className="crew-group">
                <CrewPanel
                  agentId={g.a.id}
                  managerName={g.a.name}
                  infos={g.infos}
                  now={now}
                  waiting={g.waiting}
                  quoteInto={() => document.querySelector(`.chat[data-agent="${g.a.id}"]`)}
                  onBeforeQuote={() => (onOpen(g.a.id), onClose())}
                />
                <button className="crew-open" onClick={() => (onOpen(g.a.id), onClose())}>
                  Open {g.a.name}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
