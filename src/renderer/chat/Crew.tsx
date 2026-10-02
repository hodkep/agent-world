import { useEffect, useRef, useState } from 'react'
import type { SubagentInfo } from '../../shared/chat'
import { SubagentRowView, useSubagents } from './Delegation'
import { crewCounts, crewRows, followUpText, stopRequestText } from './crewRows'
import { subagentState } from './format'

interface PanelProps {
  /** The main agent these belong to. */
  agentId: string
  managerName: string
  infos: SubagentInfo[]
  now: number
  /** Subagents waiting on you (a permission request), by their id. */
  waiting?: Set<string>
  /** Where a follow-up is written: the chat element of this agent (its message box listens there). */
  quoteInto?: () => Element | null | undefined
  /** Run first when a follow-up is started from somewhere other than this agent's own chat (it opens that chat). */
  onBeforeQuote?: () => void
}

/** All of one main agent's subagents in the same view as the delegation card: a bar, and a row each, with what can be done to it. */
export function CrewPanel({ agentId, managerName, infos, now, waiting, quoteInto, onBeforeQuote }: PanelProps) {
  const [told, setTold] = useState<string | null>(null)
  const rows = crewRows(infos)
  const c = crewCounts(infos, now)
  const send = (text: string, what: string) =>
    void window.aw.chatSend(agentId, text).then(
      () => setTold(`Asked ${managerName} to ${what}.`),
      (e: unknown) => setTold(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': /, '') : String(e))
    )
  return (
    <section className="dg dg-crew" aria-label={`Subagents of ${managerName}`}>
      <div className="dg-head">
        <span className={`dg-dot s-${c.working ? 'working' : 'done'}`} aria-hidden="true" />
        <b className="dg-title">{managerName}</b>
        <span className="dg-count">
          {[`${c.working} working`, c.done && `${c.done} done`, c.stopped && `${c.stopped} stopped`].filter(Boolean).join(' · ')} · {c.working} of {c.limit} at once
        </span>
        {c.working > 0 && (
          <button className="dg-toggle" title={`Interrupt ${managerName}: this stops every subagent that is working, not just one`} onClick={() => void window.aw.chatInterrupt(agentId).then(() => setTold(`Interrupted ${managerName}.`))}>
            Interrupt all
          </button>
        )}
      </div>
      <div className="dg-seg" aria-hidden="true">
        {rows.map((r) => (
          <i key={r.info.agentId} className={`s-${subagentState(r.info, now)}`} />
        ))}
      </div>
      {told && (
        <div className="dg-told" role="status">
          {told}
        </div>
      )}
      <div className="dg-rows">
        {rows.map((r) => {
          const st = subagentState(r.info, now)
          return (
            <SubagentRowView
              key={r.info.agentId}
              type={r.info.type}
              description={r.info.description}
              info={r.info}
              state={st}
              now={now}
              level={r.level}
              needsYou={waiting?.has(r.info.agentId)}
              actions={
                st === 'working' ? (
                  <button title="Claude Code has no way to stop just one from outside, so this asks the main agent to run its TaskStop tool" onClick={() => send(stopRequestText(r.info), `stop “${r.info.description}”`)}>
                    Ask {managerName} to stop this one
                  </button>
                ) : (
                  <button
                    title="Put this subagent into your message as a quote, so the main agent can continue it"
                    onClick={() => {
                      onBeforeQuote?.()
                      // The chat may have to open first; its message box listens once it is on screen.
                      setTimeout(() => quoteInto?.()?.dispatchEvent(new CustomEvent('aw-quote', { detail: followUpText(r.info) })), onBeforeQuote ? 250 : 0)
                    }}
                  >
                    Follow up
                  </button>
                )
              }
            />
          )
        })}
      </div>
    </section>
  )
}

/** One line above the message box while subagents are working; it opens the panel with all of them. */
export function CrewLine({ agentId, managerName, waiting }: { agentId: string; managerName: string; waiting?: Set<string> }) {
  const { infos, now } = useSubagents(agentId, null, true)
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const c = crewCounts(infos, now)
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
  useEffect(() => {
    if (c.working === 0) setOpen(false)
  }, [c.working])
  if (c.working === 0) return null
  const needs = infos.filter((i) => waiting?.has(i.agentId)).length
  return (
    <div className="procbar crewbar" ref={wrap}>
      <button className="procs-btn" onClick={() => setOpen((o) => !o)} aria-haspopup="dialog" aria-expanded={open} aria-label={`${c.working} ${c.working === 1 ? 'subagent' : 'subagents'} working`}>
        <span className="procs-dot crew-dot" aria-hidden="true" />
        {c.working} {c.working === 1 ? 'subagent' : 'subagents'} working
        <span className="crew-of">
          {c.working} of {c.limit}
        </span>
        {needs > 0 && <span className="crew-needs">{needs} need you</span>}
      </button>
      {open && (
        <div className="procs-pop crew-pop" role="dialog" aria-label="Subagents">
          <CrewPanel agentId={agentId} managerName={managerName} infos={infos} now={now} waiting={waiting} quoteInto={() => wrap.current?.closest('.chat')} />
        </div>
      )}
    </div>
  )
}
