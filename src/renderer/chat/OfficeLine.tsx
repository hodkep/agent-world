import { useState } from 'react'
import type { PictureSet } from './gallery'
import { OutlineIcon } from '../panel/IconButton'
import { type AreaRow, type OfficeGroup, areasOf, outcomeOf, stampOf, todoOf, whisperOf } from './officeCalls'
import { AREA_ICON, STAMP_ICON } from './stampIcons'
import { openTodo, todoBrief, useTodoVersion } from '../todos/todoStore'
import { ToolCard } from './ToolCard'

type Call = AreaRow['calls'][number]

/** One call of an opened row: what it did, then what it brought back, with its own card one click further. */
function CallItem({ call, onImage }: { call: Call; onImage: (src: string, set?: PictureSet) => void }) {
  const [shown, setShown] = useState(false)
  const [card, setCard] = useState(false)
  const w = whisperOf(call.run)
  const st = stampOf(call.run)
  const out = outcomeOf(call.run)
  const todo = todoOf(call.run)
  // The board may have lost the task since (removed by someone): the chip says so instead of opening nothing.
  useTodoVersion()
  const gone = todo !== null && !todoBrief(todo)
  return (
    <div className={`of-item stamp-${st.kind} ${st.state}`}>
      <div className="of-line">
        <button className="of-row" aria-expanded={shown} onClick={() => setShown(!shown)}>
          <span className="of-ic" aria-hidden="true"><OutlineIcon name={STAMP_ICON[st.kind]} size={14} /></span>
          <span className="of-txt">
            <b>{w.bold}</b>
            {w.rest && <span> {w.rest}</span>}
            {w.why && <span className="of-why"> · {w.why}</span>}
          </span>
        </button>
        {todo && (gone ? <span className="of-todo gone" title={`todo#${todo} is not on this project's board any more`}>todo#{todo} removed</span> : <button className="of-todo" onClick={() => openTodo(todo)} title={`Open todo#${todo} on the Todos board`}>todo#{todo} ↗</button>)}
      </div>
      {shown && (
        <div className="of-card">
          {out && (
            <p className="of-out">
              {out.text}
              {out.more > 0 && <span className="of-why"> … {out.more} more line{out.more === 1 ? '' : 's'}</span>}
            </p>
          )}
          {out && !card ? <button className="of-details" onClick={() => setCard(true)}>Call details</button> : <ToolCard run={call.run} working={false} onImage={onImage} />}
        </div>
      )}
    </div>
  )
}

/** One area of the fold: its name and what was done there in a line, opening to a line for each call. */
function AreaView({ row, onImage }: { row: AreaRow; onImage: (src: string, set?: PictureSet) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`of-area of-${row.area.toLowerCase()} ${row.bad > 0 ? 'bad' : ''} ${open ? 'is-open' : ''}`}>
      <button className="of-head" aria-expanded={open} aria-label={`${row.area}: ${row.text}${row.bad > 0 ? `, ${row.bad} failed` : ''}`} onClick={() => setOpen(!open)}>
        <span className="of-nm">{row.area}<span className="of-caret" aria-hidden="true">{open ? '▾' : '▸'}</span></span>
        <span className="of-sum">
          <OutlineIcon name={AREA_ICON[row.area]} size={14} />
          <span className="of-line">{row.text}</span>
        </span>
        {row.bad > 0 && <span className="of-fail">{row.bad} failed</span>}
        {row.running && <span className="su-spin of-spin" role="status" aria-label="Working" />}
      </button>
      {open && <div className="of-list">{row.calls.map((c) => <CallItem key={c.id} call={c} onImage={onImage} />)}</div>}
    </div>
  )
}

/**
 * The office's own calls (library skips and reads, todo changes, notes, the workflow tools) as a row for each area, so a todo and a workflow call are never told as one thing.
 * A row says in words what was done there; a click opens a line for each call, and a click on a line shows what it brought back and, one click further, its own card.
 * A call still running puts a spinner on its row; a failed call counts on its row in red, and its reason is in its line.
 */
export function OfficeLine({ group, working, onImage }: { group: OfficeGroup; working: boolean; onImage: (src: string, set?: PictureSet) => void }) {
  return (
    <div className="of">
      {areasOf(group.calls, working).map((row) => <AreaView key={row.area} row={row} onImage={onImage} />)}
    </div>
  )
}
