export interface TodoListRow {
  id: string
  list: string
  title: string
  status: 'open' | 'doing' | 'blocked' | 'done'
  needsYou: boolean
  /** Who is on it. */
  on?: string
  /** Who made it. */
  by: string
}

export type TodoCall =
  | { kind: 'add'; title: string; list?: string; notes?: string; needsYou: boolean; id?: string }
  | { kind: 'list'; rows: TodoListRow[]; empty: boolean }
  | { kind: 'get'; id: string }
  | { kind: 'claim'; id: string }
  | { kind: 'done'; id: string; note: string }
  | { kind: 'update'; id: string; changes: { label: string; to: string }[] }

const NAME = /(?:^|__)todo_(add|list|get|claim|done|update)$/
const str = (v: unknown) => (typeof v === 'string' ? v : '')

export const isTodoCall = (name: string): boolean => NAME.test(name)

/** One line of what todo_list answers: "todo#12 [List] Title — open, needs you; created by you 2 h ago, updated …". */
function parseRow(line: string): TodoListRow | null {
  const head = /^todo#(\d+) \[(.+?)\] (.+)$/.exec(line)
  if (!head) return null
  const rest = head[3]!
  const made = rest.indexOf('; created by ')
  const body = made >= 0 ? rest.slice(0, made) : rest
  const dash = body.lastIndexOf(' — ')
  if (dash < 0) return null
  const title = body.slice(0, dash)
  const flags = body.slice(dash + 3)
  const status = /^(open|doing|blocked|done)/.exec(flags)?.[1] as TodoListRow['status'] | undefined
  if (!status) return null
  const on = /, ([^,]+?) is on it/.exec(flags)?.[1]?.replace(/ \(.*\)$/, '')
  const by = /^(.*?) (?:just now|\d+ (?:min|h|days) ago)/.exec(made >= 0 ? rest.slice(made + '; created by '.length) : '')?.[1] ?? ''
  return { id: head[1]!, list: head[2]!, title, status, needsYou: /, needs you/.test(flags), ...(on && { on }), by }
}

/** What a todo tool call was and what it came to, read from the call's arguments and the tool's plain-text answer; null when it is not a todo tool. */
export function parseTodoCall(name: string, input: Record<string, unknown>, result: { text: string; isError: boolean } | undefined): TodoCall | null {
  const kind = NAME.exec(name)?.[1]
  if (!kind) return null
  const text = result?.text ?? ''
  if (kind === 'add') return { kind: 'add', title: str(input.title), ...(str(input.list) && { list: str(input.list) }), ...(str(input.notes) && { notes: str(input.notes) }), needsYou: input.needs_you === true, id: /todo#(\d+)/.exec(text)?.[1] }
  if (kind === 'list') {
    const rows = text.split('\n').flatMap((l) => parseRow(l) ?? [])
    return { kind: 'list', rows, empty: rows.length === 0 }
  }
  if (kind === 'get') return { kind: 'get', id: str(input.id) }
  if (kind === 'claim') return { kind: 'claim', id: str(input.id) }
  if (kind === 'done') return { kind: 'done', id: str(input.id), note: str(input.note) }
  const changes: { label: string; to: string }[] = []
  if (str(input.title)) changes.push({ label: 'Title', to: str(input.title) })
  if (str(input.status)) changes.push({ label: 'Status', to: str(input.status) })
  if (str(input.blocked_why)) changes.push({ label: 'Why', to: str(input.blocked_why) })
  if (typeof input.needs_you === 'boolean') changes.push({ label: 'Needs you', to: input.needs_you ? 'yes' : 'no' })
  if (str(input.notes)) changes.push({ label: 'Notes', to: str(input.notes) })
  return { kind: 'update', id: str(input.id), changes }
}
