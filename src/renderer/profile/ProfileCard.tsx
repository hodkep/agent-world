import { useEffect, useRef, useState } from 'react'
import { cssColor, modeInfo } from '../../shared/modes'
import type { Effort } from '../../shared/types'
import { PixelIcon } from '../chat/PixelIcon'
import { Swatch } from '../panel/ProviderTag'
import { OutlineIcon } from '../panel/IconButton'
import type { CardData } from './facts'
import { FIGURE_H, FIGURE_W, figureMood, renderFigure } from './figure'
import { agoShort, durationLabel, levelOf } from './format'
import { tokenLabel } from '../../shared/usage'
import { EFFORT_STEPS, contextGauge, costGauge, effortPips, linesGauge, toolBars } from './gauges'

/** What the card can change; each is the same action the chat's own controls take, so the chat follows. */
export interface CardEdit {
  onName: (name: string) => Promise<void>
  onModel: (model: string) => void
  onEffort: (effort: Effort) => void
  onMode: (mode: string) => void
  onCompact: () => void
}

/** Reduced motion, as the person set it for their system. */
export function useReducedMotion() {
  const [r, setR] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const q = matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setR(q.matches)
    q.addEventListener('change', on)
    return () => q.removeEventListener('change', on)
  }, [])
  return r
}

/** The portrait: redrawn about ten times a second, only while the page is showing; one still frame with reduced motion. */
function Portrait({ id, role, activity, reduced }: Pick<CardData, 'id' | 'role' | 'activity'> & { reduced: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d')
    if (!ctx) return
    let raf = 0
    let last = -1
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw)
      const frame = reduced ? 0 : Math.floor(t / 100)
      if (document.hidden || frame === last) return
      last = frame
      const f = renderFigure({ key: id, role, mood: figureMood(activity), t, reduced })
      ctx.putImageData(new ImageData(new Uint8ClampedArray(f.data), f.width, f.height), 0, 0)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [id, role, activity, reduced])
  return (
    <div className="pc-portrait" aria-hidden="true">
      <canvas ref={canvas} width={FIGURE_W} height={FIGURE_H} />
    </div>
  )
}

/** The name, with a pencil to change it in place. */
function Name({ name, edit }: { name: string; edit: CardEdit | null }) {
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  if (editing && edit)
    return (
      <span className="pc-name-edit">
        <input
          aria-label="New name"
          defaultValue={name}
          maxLength={20}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') (e.stopPropagation(), setEditing(false))
            if (e.key !== 'Enter') return
            const v = e.currentTarget.value
            edit.onName(v).then(
              () => setEditing(false),
              (err: Error) => setError(err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
            )
          }}
        />
        {error && <span className="pc-err" role="alert">{error}</span>}
      </span>
    )
  return (
    <>
      <span className="pc-name">{name}</span>
      {edit && (
        <button className="pc-pencil" aria-label={`Rename ${name}`} title="Change this agent's name" onClick={() => (setError(''), setEditing(true))}>
          <PixelIcon name="pencil" scale={1} />
        </button>
      )}
    </>
  )
}

const STEP_LABEL: Record<(typeof EFFORT_STEPS)[number], string> = { low: 'Low', medium: 'Med', high: 'High', xhigh: 'X-High', max: 'Max' }

/** A button that shows the current choice in words and opens a short list to change it, closing on a choice, a click elsewhere or Esc. */
function Pick({ value, label, swatch, options, current, onPick, disabled, title, wait }: { value: string; label: string; swatch?: string; options: { id: string; label: string; hint?: string }[]; current: string; onPick: (id: string) => void; disabled: boolean; title: string; wait: string }) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLSpanElement>(null)
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
  return (
    <span className="pc-pick" ref={wrap}>
      <button className="pc-sel" disabled={disabled} aria-haspopup="menu" aria-expanded={open} aria-label={`${label}: ${value}`} title={disabled ? wait : title} onClick={() => setOpen((o) => !o)}>
        {swatch && <i className="pc-swatch" style={{ background: swatch }} />}
        <span>{value}</span>
        <span className="pc-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="pc-menu" role="menu" aria-label={label}>
          {options.map((o) => (
            <button key={o.id} role="menuitemradio" aria-checked={o.id === current} title={o.hint} onClick={() => (setOpen(false), o.id !== current && onPick(o.id))}>
              <span className="pc-tick">{o.id === current && <PixelIcon name="check" scale={1} />}</span>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </span>
  )
}

/** One reading with its name in words, a bar under it, and what the bar means. */
function Gauge({ label, value, note, children }: { label: string; value: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="pc-g">
      <div className="pc-g-head">
        <span>{label}</span>
        <b>{value}</b>
      </div>
      {children}
      {note && <small>{note}</small>}
    </div>
  )
}

function Tile({ value, label, hint }: { value: string; label: string; hint: string }) {
  return (
    <div className="pc-tile" title={hint}>
      <b>{value}</b>
      <span>{label}</span>
    </div>
  )
}

/** What the tag beside an agent's name says about it: a plain agent is a Senior; Boss and Intern follow from what it is doing, a job is the one it was hired for. */
const ROLE_HINT: Record<string, string> = {
  Senior: 'A regular agent, working at its own desk. It is not assigned: an agent that delegates becomes a Boss, and a subagent is an Intern.',
  Boss: 'An agent that has handed work to subagents (it wears the crown while they work).',
  Intern: 'A subagent: started by another agent to do one piece of work.'
}

const STATUS: Record<string, string> = { thinking: 'Thinking', researching: 'Reading and searching', implementing: 'Editing files', running: 'Running a command', delegating: 'Handing work to subagents', compacting: 'Compacting', idle: 'Idle', waiting: 'Waiting for you', permission: 'Needs your answer', blocked: 'Blocked', asleep: 'Asleep' }

/**
 * The agent's profile card, in the world's own 8-bit look. Every part says what it is in words: a moving portrait
 * with what the agent is doing now, three labelled readings, the settings you can change (each is the same action
 * as in the chat, so the chat follows), and a few counted numbers.
 */
export function ProfileCard({ data, variant, now, edit, onClose, onToggleSize }: { data: CardData; variant: 'full' | 'compact' | 'docked'; now: number; edit: CardEdit | null; onClose: () => void; onToggleSize?: () => void }) {
  const reduced = useReducedMotion()
  // A model or thinking change restarts the agent on the same conversation, and a mode change presses its keys: both take a few
  // seconds, so the card says what it is waiting for until the new setting shows.
  const [pending, setPending] = useState<string | null>(null)
  const sawBusy = useRef(false)
  useEffect(() => {
    setPending(null)
    sawBusy.current = false
  }, [data.id, data.model, data.effort, data.modeId])
  useEffect(() => {
    if (!pending) return
    if (!data.canSwitch) sawBusy.current = true
    else if (sawBusy.current) (setPending(null), (sawBusy.current = false))
  }, [pending, data.canSwitch])
  const canSwitchNow = useRef(data.canSwitch)
  canSwitchNow.current = data.canSwitch
  useEffect(() => {
    if (!pending) return
    // The agent never looked busy and is free again (a change that shows nothing new): it is done. Otherwise give up after a while.
    const soon = setTimeout(() => !sawBusy.current && canSwitchNow.current && setPending(null), 2500)
    const late = setTimeout(() => setPending(null), 30_000)
    return () => (clearTimeout(soon), clearTimeout(late))
  }, [pending])
  const change = (what: string, go: () => void) => (setPending(what), go())
  const compact = variant === 'compact'
  const ctx = contextGauge(data.ctx)
  const cost = costGauge(data.costUsd, data.budgetUsd)
  const lines = linesGauge(data.add, data.del)
  const lv = levelOf(data.add + data.del)
  const p = data.profile
  const pips = effortPips(data.effortId)
  const mode = modeInfo(data.modeId)
  const off = !edit || !data.canSwitch || !!pending
  const wait = 'Wait until it finishes its turn'
  return (
    <section className={`pc pc-${variant}`} data-agent={data.id} aria-label={`Profile of ${data.name}`}>
      <header className="pc-title">
        <div className="pc-line">
          <span className={`pc-dot is-${figureMood(data.activity)}`} aria-hidden="true" />
          <Name name={data.name} edit={edit} />
          {onToggleSize && (
            <button className="pc-x pc-push" aria-label={compact ? 'Show the full card' : 'Show the compact card'} title={compact ? 'Show everything: level, counts and most used tools' : 'Show less'} onClick={onToggleSize}>
              <PixelIcon name={compact ? 'expand' : 'shrink'} scale={1} />
            </button>
          )}
          <button className={`pc-x ${onToggleSize ? '' : 'pc-push'}`} aria-label="Close profile card" title="Close" onClick={onClose}>
            <PixelIcon name="x" scale={1} />
          </button>
        </div>
        <div className="pc-tags">
          <span className="pc-role" title={ROLE_HINT[data.roleLabel] ?? `The job it was hired for: ${data.roleLabel}`}>{data.roleLabel}</span>
          <span className="pc-prov" title={`Runs on ${data.provider.label}`}>
            <Swatch id={data.provider.id} label={data.provider.label} />
            {data.provider.label.split(' (')[0]}
          </span>
        </div>
      </header>
      <p className="pc-status">{STATUS[data.activity] ?? data.activity}</p>
      <div className="pc-cols">
      <div>
      <div className="pc-top">
        <div className="pc-left">
          <Portrait id={data.id} role={data.role} activity={data.activity} reduced={reduced} />
          {!compact && (
            <div className="pc-lv" title="A playful level from the lines it has changed">
              <span>Level {lv.level}</span>
              <i className="pc-bar">
                <b style={{ width: `${lv.pct}%` }} />
              </i>
              <small>{lv.pct}% to level {lv.level + 1}</small>
            </div>
          )}
        </div>
        <div className="pc-gauges">
          <Gauge label="Context used" value={data.ctx === null ? (data.tokens ? `about ${tokenLabel(data.tokens.context)} tokens` : 'not reported') : `${ctx.pct}%`} note={data.ctx === null ? undefined : data.tokens ? `about ${tokenLabel(data.tokens.context)} tokens` : `${100 - ctx.pct}% left`}>
            <i className={`pc-bar hp ${ctx.tone}`}>
              <b style={{ width: `${ctx.pct}%` }} />
            </i>
          </Gauge>
          {data.tokens ? (
            <Gauge label="Tokens" value={`${tokenLabel(data.tokens.input)} read · ${tokenLabel(data.tokens.output)} written`} note="no price is reported for this program">
              <i className="pc-bar hp ok" />
            </Gauge>
          ) : (
            <Gauge label="Spent" value={cost.label} note={cost.pct === null ? 'no budget set' : `${cost.pct}% of budget`}>
              <i className={`pc-bar hp ${cost.tone}`}>{cost.pct !== null && <b style={{ width: `${cost.pct}%` }} />}</i>
            </Gauge>
          )}
          <Gauge label="Code changed" value={lines.label} note="lines added / removed">
            <i className="pc-bar split">
              <b className="add" style={{ width: `${lines.addPct}%` }} />
              <b className="del" style={{ width: `${lines.delPct}%` }} />
            </i>
          </Gauge>
        </div>
      </div>
      </div>
      <div>
      <h3 className="pc-h">Settings</h3>
      {pending && (
        <p className="pc-pending" role="status">
          <span className="su-spin" aria-hidden="true" />
          {pending}
        </p>
      )}
      <div className="pc-set">
        <span className="pc-k">Model</span>
        <Pick
          value={data.model || 'not reported'}
          label="Model"
          options={data.models.map((m) => ({ id: m.value, label: m.label }))}
          current={data.modelId}
          onPick={(id) => change('Switching model: the agent restarts on the same conversation, a few seconds…', () => edit?.onModel(id))}
          disabled={off}
          title="Change the model: the agent restarts on the same conversation"
          wait={wait}
        />
        {data.efforts.length > 0 && (
          <>
        <span className="pc-k">Thinking</span>
        <span className="pc-steps" role="group" aria-label={`Thinking level: ${data.effortId || 'default'}`}>
          {EFFORT_STEPS.filter((st) => data.efforts.includes(st)).map((st) => (
            <button key={st} className={`pc-step ${pips[EFFORT_STEPS.indexOf(st)] ? 'on' : ''} ${data.effortId === st ? 'now' : ''}`} disabled={off} aria-label={`Thinking ${st}`} aria-pressed={data.effortId === st} title={off ? wait : `Thinking: ${st}`} onClick={() => change('Changing the thinking level: the agent restarts on the same conversation, a few seconds…', () => edit?.onEffort(st))}>
              {STEP_LABEL[st]}
            </button>
          ))}
        </span>
          </>
        )}
        <span className="pc-k">Mode</span>
        <Pick
          value={mode.label}
          label="Mode"
          swatch={cssColor(mode.color)}
          options={data.modes.map((m) => ({ id: m.id, label: m.label, hint: m.blurb }))}
          current={data.modeId}
          onPick={(id) => change('Changing the mode…', () => edit?.onMode(id))}
          disabled={!edit || !!pending}
          title={mode.blurb}
          wait={wait}
        />
        {data.canCompact && (
          <button className="pc-compact-btn" disabled={off} aria-label="Compact the conversation" title={off ? wait : 'Summarise the conversation to free up context (/compact)'} onClick={() => edit?.onCompact()}>
          Compact conversation
          <small>frees up context</small>
        </button>
        )}
      </div>
      {!compact && (
        <>
          <h3 className="pc-h">So far</h3>
          <p className="pc-branch" title="The git branch it works on">
            <span>Branch</span> <b>{data.branch || 'works in the folder itself'}</b>
          </p>
          <div className="pc-tiles">
            <Tile value={p ? durationLabel(p.workedMs) : '…'} label="Worked" hint="Time spent actually working, not waiting for you" />
            <Tile value={p ? agoShort(p.hiredAt, now) : '…'} label={p?.hiredEstimated ? 'Hired ~ ago' : 'Hired ago'} hint="How long ago it was hired" />
            <Tile value={p ? String(p.turns) : '…'} label="Turns" hint="Messages you have sent it" />
            <Tile value={p ? String(p.files) : '…'} label="Files" hint="Different files it has written or edited" />
            <Tile value={p ? String(p.subagents) : '…'} label="Subagents" hint="Subagents it has started" />
            <Tile value={p ? (p.commits === null ? '–' : String(p.commits)) : '…'} label="Commits" hint="Commits on its own branch" />
          </div>
          {p && p.tools.length > 0 && (
            <>
              <h3 className="pc-h">Most used tools</h3>
              <div className="pc-toolbars">
                {toolBars(p.tools).map((t) => (
                  <div key={t.name} title={t.name}>
                    <span className="pc-tico">
                      <OutlineIcon name={t.icon} size={14} />
                    </span>
                    <span className="pc-tname">
                      <span className="pc-tlabel">{t.label}</span>
                      {t.source && <span className="pc-tsrc">{t.source}</span>}
                    </span>
                    <span className="pc-tcount">{t.count.toLocaleString('en-US')}×</span>
                    <i className="pc-bar" aria-hidden="true">
                      <b style={{ width: `${t.pct}%` }} />
                    </i>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
      </div>
      </div>
    </section>
  )
}
