import { openTodo, todoBrief, useTodoVersion } from './todoStore'

/** A link to a task, as a chip: its address, a mark for its state and its title; a click opens the Todos window on it. */
export function TodoLink({ id, showTitle = true }: { id: string; showTitle?: boolean }) {
  useTodoVersion()
  const brief = todoBrief(id)
  return (
    <button type="button" className="todo-ref" onClick={() => openTodo(id)} title={brief ? `todo#${id}: ${brief.title}. Click to open it in the Todos window.` : `todo#${id} is not on this project's board.`}>
      <i className={`s ${brief?.state ?? 'gone'}`} />
      <b>todo#{id}</b>
      {showTitle && <em>{brief ? brief.title : 'not found'}</em>}
    </button>
  )
}
