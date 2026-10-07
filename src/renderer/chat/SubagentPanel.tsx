import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChatItem, SubagentInfo } from '../../shared/chat'
import { AgentIdContext } from '../files/context'
import { stopRequestText } from './crewRows'
import { Timeline } from './Delegation'
import { elapsedLabel, subagentState, toRows } from './format'
import { Lightbox } from './Images'
import { RowView } from './ChatView'
import { liveLine, signature, tabLabel, trimFork } from './subagentView'

const read = (key: string) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/**
 * The subagents of one main agent as conversations, in a column beside the chat: a tab for each one opened, what it is, and what it
 * has thought, said and run, as the chat shows an agent's. It follows a working subagent while you are at the end of it.
 */
export function SubagentPanel({ agentId, agentName, ids, active, onActive, onClose, onCloseAll, onOpen }: { agentId: string; agentName: string; ids: string[]; active: string; onActive: (id: string) => void; onClose: (id: string) => void; onCloseAll: () => void; onOpen: (id: string) => void }) {
  const [infos, setInfos] = useState<SubagentInfo[]>([])
  const [items, setItems] = useState<ChatItem[]>([])
  const [now, setNow] = useState(() => Date.now())
  const [told, setTold] = useState<string | null>(null)
  const [zoomed, setZoomed] = useState<string | null>(null)
  const [follow, setFollow] = useState(() => read('aw.subfollow') === '1')
  const opened = useRef(Date.now())
  const log = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    let alive = true
    const load = () => void window.aw.subagents(agentId).then((l) => alive && setInfos(l), () => {})
    load()
    const t = setInterval(load, 2000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [agentId])

  // The conversation of the one shown, read again while the panel is open; a read that found nothing new changes nothing.
  useEffect(() => {
    let alive = true
    let sig = ''
    setItems([])
    stick.current = true
    const load = () =>
      void window.aw.subagentChat(agentId, active).then((got) => {
        if (!alive || signature(got) === sig) return
        sig = signature(got)
        setItems(got)
      }, () => {})
    load()
    const t = setInterval(load, 1500)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [agentId, active])

  // "Follow the newest": one that starts while the panel is open gets a tab and is shown.
  useEffect(() => {
    if (!follow) return
    const fresh = infos.find((i) => !ids.includes(i.agentId) && i.startedAt >= opened.current && subagentState(i, now) === 'working')
    if (fresh) onOpen(fresh.agentId)
  }, [follow, infos, ids, now, onOpen])

  const info = infos.find((i) => i.agentId === active)
  const state = subagentState(info, now)
  const rows = useMemo(() => toRows(trimFork(items), []), [items])
  const doing = liveLine(items, state)

  useEffect(() => {
    const el = log.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [rows, doing])

  const shown = (id: string) => infos.find((i) => i.agentId === id)
  const stop = () => {
    if (!info || !window.confirm(`Ask ${agentName} to stop “${info.description}”? It costs ${agentName} a turn.`)) return
    void window.aw.chatSend(agentId, stopRequestText(info)).then(
      () => setTold(`Asked ${agentName} to stop it.`),
      (e: unknown) => setTold(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': /, '') : String(e))
    )
  }
  const stateLabel = { waiting: 'STARTING', working: 'WORKING', done: 'DONE', stopped: 'STOPPED' }[state]

  return (
    <div className="subpanel" role="complementary" aria-label="Subagents" onKeyDown={(e) => e.key === 'Escape' && onCloseAll()}>
      <div className="sp-tabs" role="tablist" aria-label="Subagents opened">
        {ids.map((id) => {
          const i = shown(id)
          const st = subagentState(i, now)
          return (
            <div key={id} className={`sp-tab ${id === active ? 'on' : ''}`}>
              <button role="tab" aria-selected={id === active} onClick={() => onActive(id)} title={i?.description}>
                <i className={`sq ${st}`} aria-hidden="true" />
                {i ? tabLabel(i) : id.slice(0, 7)}
              </button>
              <button className="x" aria-label={`Close ${i ? tabLabel(i) : id}`} title="Close this tab" onClick={() => onClose(id)} />
            </div>
          )
        })}
        <label className="sp-follow" title="When a new subagent starts, open it here">
          <input type="checkbox" checked={follow} onChange={(e) => (setFollow(e.target.checked), (() => { try { localStorage.setItem('aw.subfollow', e.target.checked ? '1' : '') } catch { /* the choice is not kept */ } })())} />
          Follow the newest
        </label>
        <button className="sp-close" aria-label="Close the subagents panel" title="Close (Esc)" onClick={onCloseAll} />
      </div>
      <div className="sp-strip">
        <h2>{info?.description || 'Subagent'}</h2>
        <div className="sp-meta">
          <span className={`sp-pill ${state}`}>{stateLabel}</span>
          <span>
            {info?.type ?? 'agent'}
            {info?.background ? ' · background' : ''} · started by {agentName}
          </span>
          <span className="sp-time">{info ? elapsedLabel((state === 'working' ? now : info.updatedAt) - info.startedAt) : ''}</span>
        </div>
        <Timeline info={info} now={now} />
        <div className="sp-acts">
          {state === 'working' && <button onClick={stop}>Ask {agentName} to stop it</button>}
          {info?.result && <button onClick={() => void navigator.clipboard.writeText(info.result).then(() => setTold('Copied its report.'))}>Copy report</button>}
        </div>
        {told && <p className="sp-told" role="status">{told}</p>}
      </div>
      <AgentIdContext.Provider value={agentId}>
        <div
          ref={log}
          className="chat-log sp-log"
          role="log"
          aria-label={`Conversation of ${info?.description ?? 'the subagent'}`}
          onScroll={(e) => {
            const el = e.currentTarget
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
          }}
        >
          {rows.map((r) => (
            <RowView key={r.id} row={r} agentId={agentId} agentName={info?.type ?? 'subagent'} busy={false} asleep onImage={setZoomed} onRewind={() => {}} />
          ))}
          {rows.length === 0 && <p className="sp-empty">{info ? 'Nothing from it yet.' : 'Looking for it…'}</p>}
          {doing && (
            <div className="live" role="status">
              <span className="dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              the subagent is {doing}
            </div>
          )}
        </div>
      </AgentIdContext.Provider>
      {zoomed !== null && <Lightbox src={zoomed} onClose={() => setZoomed(null)} />}
    </div>
  )
}
