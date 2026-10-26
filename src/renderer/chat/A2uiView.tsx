import { useState } from 'react'
import { actionText, childrenOf, resolve, write, type A2Component, type Surface } from './a2ui'

const str = (v: unknown) => (v === undefined || v === null ? '' : String(v))
const JUSTIFY: Record<string, string> = { start: 'flex-start', end: 'flex-end', center: 'center', spaceBetween: 'space-between', spaceAround: 'space-around', spaceEvenly: 'space-evenly', stretch: 'stretch' }
const ALIGN: Record<string, string> = { start: 'flex-start', end: 'flex-end', center: 'center', stretch: 'stretch' }

/** A surface an agent drew with A2UI, from the components of the catalog; a pressed button tells the agent what was chosen. */
export function A2uiView({ surface, onAction }: { surface: Surface; onAction: (text: string) => void }) {
  const [data, setData] = useState(surface.data)
  const [sent, setSent] = useState<string | null>(null)
  const set = (v: unknown, value: unknown) => {
    const path = typeof v === 'object' && v && 'path' in v ? str((v as { path: unknown }).path) : null
    if (path) setData((d) => write(d, path, value))
  }
  const draw = (id: string): React.ReactNode => {
    const c = surface.components[id]
    if (!c) return null
    return <Piece key={id} c={c} data={data} draw={draw} set={set} press={(btn) => (setSent(btn), onAction(actionText(surface, btn, data)))} sent={sent} />
  }
  return <div className="a2ui" data-surface={surface.id}>{draw('root')}</div>
}

function Piece({ c, data, draw, set, press, sent }: { c: A2Component; data: unknown; draw: (id: string) => React.ReactNode; set: (v: unknown, value: unknown) => void; press: (id: string) => void; sent: string | null }) {
  const kids = childrenOf(c)
  const label = str(resolve(c.label, data))
  switch (c.component) {
    case 'Text': {
      const v = str(c.variant || 'body')
      return <p className={`a2-text a2-${v}`} role={/^h\d$/.test(v) ? 'heading' : undefined} aria-level={/^h\d$/.test(v) ? Number(v[1]) : undefined}>{str(resolve(c.text, data))}</p>
    }
    case 'Row':
    case 'Column':
      return (
        <div className={`a2-${c.component.toLowerCase()}`} style={{ justifyContent: JUSTIFY[str(c.justify)], alignItems: ALIGN[str(c.align)] }}>
          {kids.map(draw)}
        </div>
      )
    case 'Card':
      return <div className="a2-card">{kids.map(draw)}</div>
    case 'Divider':
      return <hr className="a2-divider" />
    case 'Button':
      return (
        <button className={`a2-button ${str(c.variant)}`} disabled={sent !== null} aria-pressed={sent === c.id} onClick={() => press(c.id)}>
          {kids.map(draw)}
        </button>
      )
    case 'TextField':
      return (
        <label className="a2-field">
          <span>{label}</span>
          <input type={c.variant === 'obscured' ? 'password' : c.variant === 'number' ? 'number' : 'text'} value={str(resolve(c.value, data))} onChange={(e) => set(c.value, e.target.value)} />
        </label>
      )
    case 'CheckBox':
      return (
        <label className="a2-check">
          <input type="checkbox" checked={resolve(c.value, data) === true} onChange={(e) => set(c.value, e.target.checked)} />
          <span>{label}</span>
        </label>
      )
    case 'Slider': {
      const v = Number(resolve(c.value, data) ?? c.min ?? 0)
      return (
        <label className="a2-field">
          <span>{label} <b>{v}</b></span>
          <input type="range" min={Number(c.min ?? 0)} max={Number(c.max ?? 100)} value={v} onChange={(e) => set(c.value, Number(e.target.value))} />
        </label>
      )
    }
    case 'ChoicePicker': {
      const options = (Array.isArray(c.options) ? c.options : []) as { label?: unknown; value?: unknown }[]
      const chosen = resolve(c.value, data)
      const picked = Array.isArray(chosen) ? chosen.map(str) : []
      const one = c.variant !== 'multipleSelection'
      return (
        <fieldset className="a2-choice">
          <legend>{label}</legend>
          {options.map((o) => {
            const value = str(o.value)
            const on = picked.includes(value)
            return (
              <label key={value} className={on ? 'on' : ''}>
                <input type={one ? 'radio' : 'checkbox'} name={c.id} checked={on} onChange={() => set(c.value, one ? [value] : on ? picked.filter((p) => p !== value) : [...picked, value])} />
                <span>{str(resolve(o.label, data))}</span>
              </label>
            )
          })}
        </fieldset>
      )
    }
    default:
      return null
  }
}
