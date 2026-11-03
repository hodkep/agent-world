import { useEffect, useState } from 'react'

const lists = (n: number) => `${n} ${n === 1 ? 'list' : 'lists'}`

/**
 * The most todo lists an agent may create. Empty is no limit. The number cannot be lower than the lists the Todos screen already has:
 * a lower one is not saved, and the box says why.
 */
export function ListLimitRow({ value, lists: have, onChange }: { value: number; lists: number; onChange: (limit: number) => void }) {
  const [text, setText] = useState(value ? String(value) : '')
  useEffect(() => setText(value ? String(value) : ''), [value])

  const trimmed = text.trim()
  const n = Number(trimmed)
  const error = !trimmed ? '' : !Number.isInteger(n) || n < 1 ? 'Use a whole number from 1 up, or leave it empty for no limit.' : n < have ? `The Todos screen has ${lists(have)}, so the limit cannot be lower than ${have}. It was not changed.` : ''

  const edit = (v: string) => {
    setText(v)
    const t = v.trim()
    if (!t) return onChange(0)
    const k = Number(t)
    if (Number.isInteger(k) && k >= 1 && k >= have) onChange(k)
  }

  return (
    <div className="set-num">
      <label htmlFor="todo-list-limit"><b>Most lists an agent may create</b></label>
      <div className="set-num-in">
        <input id="todo-list-limit" type="number" min={Math.max(1, have)} step={1} inputMode="numeric" placeholder="No limit" value={text} aria-invalid={error ? true : undefined} aria-describedby="todo-list-limit-hint" onChange={(e) => edit(e.target.value)} />
        <span>lists</span>
      </div>
      {error ? (
        <small id="todo-list-limit-hint" className="set-num-err" role="alert">{error}</small>
      ) : (
        <small id="todo-list-limit-hint">
          {value ? `An agent that wants another list than these ${value} is told to use one it has. Lists you add yourself do not count.` : `Empty means no limit. The Todos screen has ${lists(have)} now, so the limit cannot be lower than ${have}.`}
        </small>
      )}
    </div>
  )
}
