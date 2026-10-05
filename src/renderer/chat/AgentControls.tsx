import { effortsFor, modelOf } from '../panel/efforts'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import type { ModeInfo } from '../../shared/modes'
import { type Role, isCurrentRole } from '../../shared/roles'
import type { Capabilities, Effort } from '../../shared/types'
import { type UsageLimits, limitView, tokenLabel } from '../../shared/usage'
import { EFFORTS, MODELS } from '../panel/HireForm'
import { PixelIcon } from './PixelIcon'

/** What the controls under the message box show about the agent. */
export interface AgentInfo {
  model: string | null
  effort: string | null
  fast: boolean
  contextPct: number | null
  costUsd: number
  budgetUsd?: number
  budgetAlert?: 'near' | 'over'
  linesAdded: number
  linesRemoved: number
  branch: string | null
  /** Model and effort can only change between turns. */
  canSwitch: boolean
  started: boolean
  /** The job stored in the agent's options (a role's title), if any. */
  role?: string
  /** What its program offers; Claude's lists when not given. */
  models?: { value: string; label: string }[]
  modes?: ModeInfo[]
  /** The modes its program only reaches by restarting the agent. */
  relaunch?: string[]
  /** For a program that counts tokens rather than dollars. */
  tokens?: { input: number; output: number; context: number }
  /** Whether its program can summarise the conversation on request, and shows its limits with each agent. */
  canCompact?: boolean
  liveLimits?: boolean
  /** What its program can do; anything it cannot is not offered. */
  can?: Partial<Capabilities>
  /** Its file of standing project notes. */
  handbook?: string
}

/** What the controls can do: App owns the work, the box only asks for it. */
export interface AgentActions {
  switchTo: (change: { model?: string; effort?: Effort }) => void
  roles: Role[]
  /** Another job for this agent, or none; it relaunches on the same conversation. */
  setRole: (role: Role | null) => void
  reviewers: { id: string; name: string }[]
  askReview: (reviewer: string) => void
  /** Open the dialog that hands this agent's branch to another agent. */
  handoff: () => void
  clone: (model?: string) => void
  /** Summarise the conversation to free up context (the /compact command). */
  compact: () => void
  handbook: () => void
  tools: () => void
  finish: () => void
  rename: () => void
  group: () => void
  remove: () => void
}

/** Closes a pop-up on a click elsewhere or Esc. */
function useDismiss(open: boolean, close: () => void) {
  const wrap = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && close()
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), close())
    window.addEventListener('mousedown', away)
    window.addEventListener('keydown', esc, true)
    return () => {
      window.removeEventListener('mousedown', away)
      window.removeEventListener('keydown', esc, true)
    }
  }, [open, close])
  return wrap
}

const level = (pct: number) => (pct >= 80 ? 'hot' : pct >= 60 ? 'warm' : '')

/** A circle filled to the share of a limit that is used. */
export function Ring({ pct, small }: { pct: number | null; small?: boolean }) {
  const p = Math.max(0, Math.min(100, pct ?? 0))
  return <span className={`cb-ring ${level(p)} ${small ? 'small' : ''}`} style={{ ['--p' as string]: p }} aria-hidden="true" />
}

function Pop({ children, align = 'left', label }: { children: ReactNode; align?: 'left' | 'right'; label: string }) {
  return (
    <div className={`cb-pop ${align}`} role="menu" aria-label={label}>
      {children}
    </div>
  )
}

export function ModelChip({ info, actions }: { info: AgentInfo; actions: AgentActions }) {
  const [open, setOpen] = useState(false)
  const wrap = useDismiss(open, () => setOpen(false))
  const current = (info.model ?? '').toLowerCase()
  const models = (info.models ?? MODELS).filter((m) => m.value)
  const efforts = effortsFor(info.models ?? MODELS, undefined, info.model)
  // A program that builds the level into the model's name needs the model with it.
  const running = modelOf(info.models ?? MODELS, undefined, info.model)
  return (
    <span className="cb-anchor" ref={wrap}>
      <button className="cb-chip" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label="Model and effort" title={`${info.model ?? 'Model'}${info.effort ? ` · effort ${info.effort}` : ''}`}>
        {info.model ?? 'model ?'}
        {info.effort ? ` · ${info.effort}` : ''}
        <PixelIcon name="chevron" />
      </button>
      {open && (
        <Pop label="Model and effort">
          <h6>Model</h6>
          {models.map((m) => {
            const on = current.includes(m.value) || current === m.label.toLowerCase()
            return (
            <button key={m.value} className="cb-row" role="menuitemradio" aria-checked={on} disabled={!info.canSwitch} onClick={() => (setOpen(false), actions.switchTo({ model: m.value }))}>
              <span className="tick">{on ? '▪' : ''}</span>
              {m.label}
            </button>
            )
          })}
          {efforts.length > 0 ? (
            <>
              <h6>Effort</h6>
              <div className="cb-steps">
                {EFFORTS.filter((e) => e.value && efforts.includes(e.value)).map((e) => (
                  <button key={e.value} className={info.effort === e.value ? 'on' : ''} disabled={!info.canSwitch} onClick={() => (setOpen(false), actions.switchTo({ effort: e.value as Effort, ...(running?.efforts && { model: running.value }) }))}>
                    {e.value === 'medium' ? 'med' : e.value}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="cb-note">This model has no thinking levels.</p>
          )}
          {!info.canSwitch && <p className="cb-note">Available between turns.</p>}
        </Pop>
      )}
    </span>
  )
}

export function UsageRing({ info, limits, actions }: { info: AgentInfo; limits: UsageLimits; actions: AgentActions }) {
  const [open, setOpen] = useState(false)
  const wrap = useDismiss(open, () => setOpen(false))
  const now = Date.now()
  const five = limitView(limits.fiveHour, now)
  const week = limitView(limits.sevenDay, now)
  // Context is a share where the program says so; where it only counts tokens, it is that count (roughly what the conversation holds).
  const rows: { name: string; pct: number | null; note?: string }[] = [
    { name: 'Context', pct: info.contextPct, note: info.tokens ? `about ${tokenLabel(info.tokens.context)} tokens` : undefined },
    ...(info.liveLimits === false ? [] : [
      { name: '5-hour limit', pct: five.pct, note: five.reset && `resets ${five.reset}` },
      { name: 'Weekly limit', pct: week.pct, note: week.reset && `resets ${week.reset}` }
    ])
  ]
  return (
    <span className="cb-anchor" ref={wrap}>
      <button className="cb-icon" onClick={() => setOpen((o) => !o)} aria-haspopup="dialog" aria-expanded={open} aria-label="Context and usage" title={info.contextPct === null ? 'Context and usage' : `Context ${Math.round(info.contextPct)}% used`}>
        <Ring pct={info.contextPct} />
      </button>
      {open && (
        <div className="cb-pop right usage" role="dialog" aria-label="Usage">
          <h6>Usage</h6>
          {rows.map((r) => (
            <div key={r.name} className="cb-meter">
              <Ring pct={r.pct} small />
              <span>{r.name}</span>
              <span className="muted">{r.pct === null ? '–' : `${Math.round(100 - r.pct)}% left`}</span>
              {r.name === 'Context' && info.canCompact !== false && (
                <button className="cb-compact" disabled={!info.canSwitch || !info.started} onClick={() => (setOpen(false), actions.compact())} title={info.canSwitch ? 'Summarise the conversation to free up context (/compact)' : 'Available between turns'}>
                  Compact
                </button>
              )}
              {r.note && <span className="cb-meter-note">{r.note}</span>}
            </div>
          ))}
          <div className="cb-facts">
            {info.tokens ? (
              <span title="This program reports tokens, not a price">{tokenLabel(info.tokens.input)} read · {tokenLabel(info.tokens.output)} written</span>
            ) : (
              <span className={info.budgetAlert ? `budget-${info.budgetAlert}` : ''}>
                ${info.costUsd.toFixed(2)}
                {info.budgetUsd ? ` / $${info.budgetUsd.toFixed(2)}` : ''}
              </span>
            )}
            <span>
              +{info.linesAdded} −{info.linesRemoved}
            </span>
            {info.fast && <span>fast</span>}
          </div>
        </div>
      )}
    </span>
  )
}

export function MoreMenu({ info, actions }: { info: AgentInfo; actions: AgentActions }) {
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState<'main' | 'review' | 'clone' | 'role'>('main')
  const close = () => setOpen(false)
  const wrap = useDismiss(open, close)
  const run = (f: () => void) => () => (close(), f())
  const back = (title: string) => (
    <button className="cb-back" onClick={() => setPage('main')}>
      <PixelIcon name="back" />
      {title}
    </button>
  )
  return (
    <span className="cb-anchor" ref={wrap}>
      <button className="cb-icon" onClick={() => (setPage('main'), setOpen((o) => !o))} aria-haspopup="menu" aria-expanded={open} aria-label="More actions" title="Review, clone, handbook and more">
        <PixelIcon name="dots" />
      </button>
      {open && (
        <div className="cb-pop right more" role="menu" aria-label="More actions">
          {page === 'main' && (
            <>
              <div className="cb-tiles">
                {info.branch && (
                  <button className="cb-tile" role="menuitem" onClick={() => setPage('review')}>
                    <PixelIcon name="review" />
                    Review
                    <small>ask a peer</small>
                  </button>
                )}
                {info.can?.clone !== false && (
                  <button className="cb-tile" role="menuitem" disabled={!info.started} onClick={() => setPage('clone')} title={info.started ? '' : 'Nothing to copy until the conversation has started'}>
                    <PixelIcon name="clone" />
                    Clone
                    <small>fork this chat</small>
                  </button>
                )}
                {info.branch && (
                  <button className="cb-tile" role="menuitem" onClick={run(actions.handbook)}>
                    <PixelIcon name="book" />
                    Handbook
                    <small>{info.handbook ?? 'CLAUDE.md'}</small>
                  </button>
                )}
                <button className="cb-tile" role="menuitem" onClick={run(actions.tools)}>
                  <PixelIcon name="tools" />
                  Tools
                  <small>MCP · plugins</small>
                </button>
              </div>
              {info.branch && (
                <button className="cb-row finish" role="menuitem" onClick={run(actions.finish)}>
                  <PixelIcon name="flag" />
                  Finish this branch
                </button>
              )}
              {info.branch && (
                <button className="cb-row" role="menuitem" onClick={run(actions.handoff)} title="Give this branch to another agent to review, continue or answer a question about">
                  <PixelIcon name="review" />
                  Hand off…
                </button>
              )}
              <div className="cb-sep" />
              <button className="cb-row" role="menuitem" onClick={run(actions.rename)}>
                <PixelIcon name="pencil" />
                Rename
              </button>
              {info.can?.changeRole !== false && (
                <button className="cb-row" role="menuitem" disabled={!info.canSwitch} title={info.canSwitch ? '' : 'Wait until it finishes its turn'} onClick={() => setPage('role')}>
                  <PixelIcon name="tag" />
                  Change role…
                </button>
              )}
              <button className="cb-row" role="menuitem" onClick={run(actions.group)}>
                <PixelIcon name="tag" />
                Group…
              </button>
              <button className="cb-row danger" role="menuitem" onClick={run(actions.remove)}>
                <PixelIcon name="x" />
                Remove agent
              </button>
            </>
          )}
          {page === 'review' && (
            <>
              {back('Review')}
              {actions.reviewers.map((r) => (
                <button key={r.id} className="cb-row" role="menuitem" onClick={run(() => actions.askReview(r.id))}>
                  Ask {r.name}
                </button>
              ))}
              <button className="cb-row" role="menuitem" onClick={run(() => actions.askReview('new'))}>
                <PixelIcon name="plus" />
                Hire a new reviewer
              </button>
            </>
          )}
          {page === 'role' && (
            <>
              {back('Change role')}
              <button className="cb-row" role="menuitemradio" aria-checked={isCurrentRole(info.role, null)} onClick={run(() => !isCurrentRole(info.role, null) && actions.setRole(null))}>
                {isCurrentRole(info.role, null) && <span aria-hidden="true">✓ </span>}
                No role
                <small>normal agent</small>
              </button>
              {actions.roles.map((r) => (
                <button key={r.id} className="cb-row" role="menuitemradio" aria-checked={isCurrentRole(info.role, r)} onClick={run(() => !isCurrentRole(info.role, r) && actions.setRole(r))} title={r.blurb}>
                  {isCurrentRole(info.role, r) && <span aria-hidden="true">✓ </span>}
                  {r.title}
                </button>
              ))}
            </>
          )}
          {page === 'clone' && (
            <>
              {back('Clone into a new branch')}
              <button className="cb-row" role="menuitem" onClick={run(() => actions.clone())}>
                Same model
              </button>
              {(info.models ?? MODELS).filter((m) => m.value).map((m) => (
                <button key={m.value} className="cb-row" role="menuitem" onClick={run(() => actions.clone(m.value))}>
                  {m.label}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </span>
  )
}
