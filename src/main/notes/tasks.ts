import { linkLine, notePlan } from '../../shared/notePlan'

/** Makes the tasks a note's lines stand for: each in the order of the lines (an umbrella before its parts), the ticked ones finished, and each line marked with the number of the task it became. The note comes back with those marks. */
export function makeTasks(
  text: string,
  lists: string[],
  deps: { add: (i: { title: string; list?: string; parent?: string }) => { id: string }; done: (id: string) => void },
  only?: Set<number>
): { text: string; made: { line: number; id: string }[] } {
  const made: { line: number; id: string }[] = []
  const idOf = new Map<number, string>()
  let out = text
  for (const t of notePlan(text, lists, only)) {
    const parent = t.parentTodo ?? (t.parent !== undefined ? idOf.get(t.parent) : undefined)
    const todo = deps.add({ title: t.title, ...(t.list && !parent && { list: t.list }), ...(parent && { parent }) })
    if (t.done) deps.done(todo.id)
    idOf.set(t.line, todo.id)
    made.push({ line: t.line, id: todo.id })
    out = linkLine(out, t.line, todo.id)
  }
  return { text: out, made }
}
