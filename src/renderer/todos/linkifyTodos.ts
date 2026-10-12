import { findTodoRefs } from '../../shared/todoLinks'
import { todoBrief } from './todoStore'

const SKIP = 'pre, code, a, button, textarea, input, .todo-ref'

/** Fills a link to a task: its address, a mark for its state, and its title when it is known; a task that is gone says so. */
export function paintTodoRef(el: HTMLElement) {
  const id = el.dataset.todo ?? ''
  const brief = todoBrief(id)
  el.replaceChildren()
  const s = document.createElement('i')
  s.className = `s ${brief?.state ?? 'gone'}`
  const addr = document.createElement('b')
  addr.textContent = `todo#${id}`
  el.append(s, addr)
  if (brief) {
    const t = document.createElement('em')
    t.textContent = brief.title
    el.append(t)
  } else {
    const t = document.createElement('em')
    t.textContent = 'not found'
    el.append(t)
  }
  el.title = brief ? `todo#${id}: ${brief.title}. Click to open it in the Todos window.` : `todo#${id} is not on this project's board.`
}

/** Turns each `todo#N` in the text of a message into a link that opens the task; code, links and buttons are left as they are. */
export function linkifyTodos(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const texts: Text[] = []
  for (let n = walker.nextNode(); n; n = walker.nextNode()) texts.push(n as Text)
  for (const t of texts) {
    if (!t.parentElement || t.parentElement.closest(SKIP)) continue
    const refs = findTodoRefs(t.data)
    // Right to left, so earlier offsets stay valid as the node is split.
    for (const r of refs.reverse()) {
      const rest = t.splitText(r.start)
      rest.splitText(r.end - r.start)
      const chip = document.createElement('button')
      chip.type = 'button'
      chip.className = 'todo-ref'
      chip.dataset.todo = r.id
      paintTodoRef(chip)
      rest.replaceWith(chip)
    }
  }
  for (const chip of root.querySelectorAll<HTMLElement>('.todo-ref')) paintTodoRef(chip)
}
