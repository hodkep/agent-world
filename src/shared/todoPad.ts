import { resolveList } from './todos'

export interface PadTask {
  title: string
  notes: string
  /** The list a heading above it names (matched to an existing one), else the Inbox. */
  list?: string
  done: boolean
  /** The lines it was written as, to put back. */
  raw: string
}

export interface PadPlan {
  tasks: PadTask[]
  /** The pad without the lines that become tasks (and without a heading left with nothing under it). */
  rest: string
  /** The lines that become tasks, as written, so they can be put back. */
  used: string
}

const HEADING = /^\s{0,3}#{1,3}\s+(.+?)\s*#*\s*$/
const BULLET = /^ {0,1}[-*+]\s+(?:\[([ xX])\]\s*)?(.*)$/
const INDENTED = /^(?: {2,}|\t+)\S/

/** What a markdown scratch pad would make: a bullet (with or without a box) is a task, a heading names the list for the tasks under it, an indented line under a task is its notes. Everything else is left in the pad. */
export function padPlan(text: string, lists: string[]): PadPlan {
  const lines = text.split('\n')
  const tasks: PadTask[] = []
  // Each kept line, and for a heading which tasks sit under it (so it can go when they all went).
  const keep: { line: string; heading?: { under: number } }[] = []
  let list: string | undefined
  let current: PadTask | undefined
  let head: { under: number } | undefined
  for (const line of lines) {
    const h = HEADING.exec(line)
    if (h) {
      list = resolveList(lists, h[1]!)
      head = { under: 0 }
      current = undefined
      keep.push({ line, heading: head })
      continue
    }
    const b = BULLET.exec(line)
    if (b && b[2]!.trim()) {
      current = { title: b[2]!.trim(), notes: '', ...(list && { list }), done: b[1] === 'x' || b[1] === 'X', raw: line }
      tasks.push(current)
      if (head) head.under++
      continue
    }
    if (current && INDENTED.test(line)) {
      current.notes = current.notes ? `${current.notes}\n${line.trim()}` : line.trim()
      current.raw += `\n${line}`
      continue
    }
    // Any other line ends the notes of the task above it and stays in the pad.
    current = undefined
    keep.push({ line })
  }
  // A heading with nothing of its own left under it goes with its tasks.
  const rest: string[] = []
  for (let i = 0; i < keep.length; i++) {
    const k = keep[i]!
    if (k.heading && k.heading.under > 0) {
      let j = i + 1
      while (j < keep.length && !keep[j]!.heading && !keep[j]!.line.trim()) j++
      if (j >= keep.length || keep[j]!.heading) continue
    }
    rest.push(k.line)
  }
  const joined = rest.join('\n').replace(/^\n+/, '').replace(/\n{3,}/g, '\n\n')
  return { tasks, rest: joined.trim() ? joined.replace(/\n*$/, '\n') : '', used: tasks.map((t) => t.raw).join('\n') }
}
