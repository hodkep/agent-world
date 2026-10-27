import { resolveList } from './todos'

export interface NoteLine {
  line: number
  kind: 'heading' | 'item' | 'text'
  /** Spaces before a bullet (a tab counts as 4). */
  indent: number
  /** The words, without the bullet, the box or the task number. */
  title: string
  done: boolean
  /** The task this line already became. */
  todo?: string
}

const HEADING = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/
const ITEM = /^(\s*)[-*+]\s+(?:\[([ xX])\]\s*)?(.*)$/
const LINKED = /\s*\(todo#(\d+)\)\s*$/

/** Each line of a note as what it is: a heading, a bullet or checklist item (with the task it became, if it did), or plain text. */
export function noteLines(text: string): NoteLine[] {
  return text.split('\n').map((raw, line) => {
    const h = HEADING.exec(raw)
    if (h) return { line, kind: 'heading', indent: 0, title: h[1]!, done: false }
    const m = ITEM.exec(raw)
    // An item with no words yet (the one Enter has just started) is an item, drawn with its box; it makes no task until it has words.
    if (m) {
      const link = LINKED.exec(m[3]!)
      return { line, kind: 'item', indent: m[1]!.replace(/\t/g, '    ').length, title: m[3]!.replace(LINKED, '').trim(), done: m[2] === 'x' || m[2] === 'X', ...(link && { todo: link[1] }) }
    }
    return { line, kind: 'text', indent: 0, title: raw.trim(), done: false }
  })
}

export interface NoteTask {
  line: number
  title: string
  done: boolean
  /** The line of the item this is a subtask of, when that is made in the same go. */
  parent?: number
  /** The task its parent line already is. */
  parentTodo?: string
  /** The list a heading above it names, when the board has that list. */
  list?: string
}

/** What a note would make: a task for each top-level bullet or checklist line, and a subtask for each indented one under it. A line that is already a task is left out; `only` limits it to some lines. */
export function notePlan(text: string, lists: string[], only?: Set<number>): NoteTask[] {
  const out: NoteTask[] = []
  let list: string | undefined
  let top: NoteLine | undefined
  for (const l of noteLines(text)) {
    if (l.kind === 'heading') {
      const r = resolveList(lists, l.title)
      list = lists.includes(r) ? r : undefined
      top = undefined
      continue
    }
    if (l.kind !== 'item' || !l.title) continue
    const sub = l.indent >= 2 && top !== undefined
    if (!sub) top = l
    if (l.todo || (only && !only.has(l.line))) continue
    const parent = sub ? top! : undefined
    const inPlan = parent && (!only || only.has(parent.line)) && !parent.todo
    out.push({
      line: l.line,
      title: l.title,
      done: l.done,
      ...(inPlan && { parent: parent.line }),
      ...(parent?.todo && { parentTodo: parent.todo }),
      ...(list && { list })
    })
  }
  return out
}

/** Marks a line as the task it became, at its end (once). */
export function linkLine(text: string, line: number, id: string): string {
  const lines = text.split('\n')
  const cur = lines[line]
  if (cur === undefined || LINKED.test(cur)) return text
  lines[line] = `${cur.trimEnd()} (todo#${id})`
  return lines.join('\n')
}

/** What a note is called: its first line without the Markdown on it. */
export function noteTitle(text: string): string {
  const first = text.split('\n').find((l) => l.trim())
  if (!first) return 'New note'
  const t = first.replace(/^\s*(?:#{1,6}\s+|[-*+]\s+(?:\[[ xX]\]\s*)?|>\s*)/, '').replace(/[*_`~]/g, '').replace(LINKED, '').trim()
  return (t || 'New note').slice(0, 60)
}

/** The lines indented under an item (until a line that is not indented more, or is not an item). */
export function childLines(text: string, line: number): number[] {
  const ls = noteLines(text)
  const me = ls[line]
  if (!me || me.kind !== 'item') return []
  const out: number[] = []
  for (let i = line + 1; i < ls.length; i++) {
    const l = ls[i]!
    if (l.kind !== 'item' || l.indent <= me.indent) break
    out.push(i)
  }
  return out
}

/** The note with a top-level item moved in under the top-level item above it, with its own parts moved in too; null when it is not top-level or there is nothing above to go under. */
export function indentUnder(text: string, line: number): string | null {
  const ls = noteLines(text)
  const me = ls[line]
  if (!me || me.kind !== 'item' || me.indent >= 2) return null
  const above = ls.slice(0, line).some((l) => l.kind === 'item' && l.indent < 2)
  if (!above) return null
  const lines = text.split('\n')
  for (const i of [line, ...childLines(text, line)]) lines[i] = `  ${lines[i]}`
  return lines.join('\n')
}

/** What Enter does in a bullet or checklist line: the next line begins with the same bullet (and an empty box, for a checklist) at the same indent; on an empty item it takes the bullet away instead, which ends the list. Null when the line is not an item or the cursor is before its words, so the editor does its own. */
export function continueList(text: string, pos: number): { from: number; to: number; insert: string } | null {
  const start = text.lastIndexOf('\n', pos - 1) + 1
  const nl = text.indexOf('\n', pos)
  const end = nl === -1 ? text.length : nl
  const line = text.slice(start, end)
  const m = /^(\s*)([-*+])\s+(?:(\[[ xX]\])\s?)?/.exec(line)
  if (!m || pos - start < m[0].length) return null
  if (!line.slice(m[0].length).trim()) return { from: start, to: end, insert: '' }
  return { from: pos, to: pos, insert: `\n${m[1]}${m[2]} ${m[3] ? '[ ] ' : ''}` }
}
