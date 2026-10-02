import { useEffect, useRef, useState } from 'react'
import { PICKABLE_MODES, cssColor, modeInfo } from '../../shared/modes'
import type { Effort } from '../../shared/types'
import { type IconName, PixelIcon } from '../chat/PixelIcon'
import { MODELS } from '../panel/HireForm'
import { type CardData, factRows } from './facts'
import { FIGURE_H, FIGURE_W, figureMood, renderFigure } from './figure'
import { agoShort, durationLabel, levelOf } from './format'
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

/** A button that opens a short list to choose from, closing on a choice, a click elsewhere or Esc. */
function Pick({ icon, iconColor, value, label, options, current, onPick, disabled, title, iconOnly }: { icon: IconName; iconColor?: string; value: string; label: string; options: { id: string; label: string; hint?: string }[]; current: string; onPick: (id: string) => void; disabled: boolean; title: string; iconOnly: boolean }) {
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
      <button className="pc-ctl" disabled={disabled} aria-haspopup="menu" aria-expanded={open} aria-label={`${label}: ${value}`} title={disabled ? 'Wait until it finishes its turn' : title} onClick={() => setOpen((o) => !o)}>
        <span style={iconColor ? { color: iconColor } : undefined}>
          <PixelIcon name={icon} scale={2} />
        </span>
        {!iconOnly && <span className="pc-ctl-v">{value}</span>}
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

function Gauge({ icon, label, value, children }: { icon: IconName; label: string; value: string; children: React.ReactNode }) {
  return (
    <div className="pc-gauge" role="img" aria-label={`${label}: ${value}`}>
      <PixelIcon name={icon} scale={2} />
      <div className="pc-gauge-bar">{children}</div>
      <span className="pc-gauge-v">{value}</span>
    </div>
  )
}

function Tile({ icon, value, label }: { icon: IconName; value: string; label: string }) {
  return (
    <div className="pc-tile" title={label}>
      <PixelIcon name={icon} scale={2} />
      <b>{value}</b>
      <span>{label}</span>
    </div>
  )
}

/**
 * The agent's profile card, in the world's own 8-bit look: a moving portrait, three gauges, the settings you can change
 * (each is the same action as in the chat, so the chat follows), and a few numbers as tiles. The same facts are also
 * in the panel as text.
 */
export function ProfileCard({ data, variant, now, edit }: { data: CardData; variant: 'full' | 'compact' | 'docked'; now: number; edit: CardEdit | null }) {
  const reduced = useReducedMotion()
  const compact = variant === 'compact'
  const ctx = contextGauge(data.ctx)
  const cost = costGauge(data.costUsd, data.budgetUsd)
  const lines = linesGauge(data.add, data.del)
  const lv = levelOf(data.add + data.del)
  const p = data.profile
  const pips = effortPips(data.effortId)
  const mode = modeInfo(data.modeId)
  const off = !edit || !data.canSwitch
  return (
    <section className={`pc pc-${variant}`} data-agent={data.id} aria-label={`Profile of ${data.name}`}>
      <header className="pc-title">
        <span className={`pc-dot is-${figureMood(data.activity)}`} aria-hidden="true" />
        <Name name={data.name} edit={edit} />
        <span className="pc-role">{data.roleLabel}</span>
      </header>
      <div className="pc-top">
        <div className="pc-left">
          <Portrait id={data.id} role={data.role} activity={data.activity} reduced={reduced} />
          {!compact && (
            <div className="pc-lv" role="img" aria-label={`Level ${lv.level}, ${lv.pct}% to the next`}>
              <span>LV {lv.level}</span>
              <i className="pc-bar">
                <b style={{ width: `${lv.pct}%` }} />
              </i>
            </div>
          )}
        </div>
        <div className="pc-gauges">
          <Gauge icon="battery" label="Context used" value={data.ctx === null ? '–' : `${ctx.pct}%`}>
            <i className={`pc-bar hp ${ctx.tone}`}>
              <b style={{ width: `${ctx.pct}%` }} />
            </i>
          </Gauge>
          <Gauge icon="coin" label="Cost" value={cost.label.replace(' of ', '/')}>
            <i className={`pc-bar hp ${cost.tone}`}>{cost.pct !== null && <b style={{ width: `${cost.pct}%` }} />}</i>
          </Gauge>
          <Gauge icon="lines" label="Lines changed" value={lines.label}>
            <i className="pc-bar split">
              <b className="add" style={{ width: `${lines.addPct}%` }} />
              <b className="del" style={{ width: `${lines.delPct}%` }} />
            </i>
          </Gauge>
        </div>
      </div>
      <div className="pc-controls" role="group" aria-label="Settings">
        <Pick
          icon="chip"
          value={data.model || 'model'}
          label="Model"
          options={MODELS.filter((m) => m.value).map((m) => ({ id: m.value, label: m.label }))}
          current={data.modelId}
          onPick={(id) => edit?.onModel(id)}
          disabled={off}
          title="Change the model: the agent restarts on the same conversation"
          iconOnly={compact}
        />
        <span className="pc-think" role="group" aria-label={`Thinking level: ${data.effortId || 'default'}`}>
          <PixelIcon name="bulb" scale={2} />
          {EFFORT_STEPS.map((s, i) => (
            <button key={s} className={`pc-pip ${pips[i] ? 'on' : ''}`} disabled={off} aria-label={`Thinking ${s}`} aria-pressed={data.effortId === s} title={off ? 'Wait until it finishes its turn' : `Thinking: ${s}`} onClick={() => edit?.onEffort(s)} />
          ))}
        </span>
        <Pick
          icon="shield"
          iconColor={cssColor(mode.color)}
          value={mode.label}
          label="Mode"
          options={PICKABLE_MODES.map((m) => ({ id: m.id, label: m.label, hint: m.blurb }))}
          current={data.modeId}
          onPick={(id) => edit?.onMode(id)}
          disabled={!edit}
          title="Change what it may do without asking"
          iconOnly={compact}
        />
        <button className="pc-ctl" disabled={off} aria-label="Compact the conversation" title={off ? 'Wait until it finishes its turn' : 'Summarise the conversation to free up context (/compact)'} onClick={() => edit?.onCompact()}>
          <PixelIcon name="squeeze" scale={2} />
          {!compact && <span className="pc-ctl-v">Compact</span>}
        </button>
      </div>
      {!compact && (
        <>
          <div className="pc-tiles">
            <Tile icon="clock" value={p ? durationLabel(p.workedMs) : '…'} label="worked" />
            <Tile icon="calendar" value={p ? agoShort(p.hiredAt, now) : '…'} label={p?.hiredEstimated ? 'hired ~' : 'hired'} />
            <Tile icon="chat" value={p ? String(p.turns) : '…'} label="turns" />
            <Tile icon="file" value={p ? String(p.files) : '…'} label="files" />
            <Tile icon="team" value={p ? String(p.subagents) : '…'} label="subagents" />
            <Tile icon="branch" value={p ? (p.commits === null ? '–' : String(p.commits)) : '…'} label="commits" />
          </div>
          {p && p.tools.length > 0 && (
            <div className="pc-toolbars" role="img" aria-label={`Most used tools: ${p.tools.map(([n, c]) => `${n} ${c}`).join(', ')}`}>
              {toolBars(p.tools).map((t) => (
                <div key={t.name}>
                  <span>{t.name}</span>
                  <i className="pc-bar">
                    <b style={{ width: `${t.pct}%` }} />
                  </i>
                  <span>{t.count}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}

/** The same facts as plain text, in the panel: what the keyboard and a screen reader get. */
export function ProfileFacts({ data, now }: { data: CardData; now: number }) {
  return (
    <details className="profile-facts">
      <summary>Profile</summary>
      <dl>
        {factRows(data, now).map((r) => (
          <div key={r.key}>
            <dt>{r.label}</dt>
            <dd>{r.value}</dd>
          </div>
        ))}
      </dl>
    </details>
  )
}
