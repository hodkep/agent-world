export interface TodoRef {
  id: string
  start: number
  end: number
}

/** `todo#14` or `todo #14`: how a task is named in text. A bare `#14` is left alone, because it so often means a pull request or issue elsewhere. */
export function findTodoRefs(text: string): TodoRef[] {
  const out: TodoRef[] = []
  for (const m of text.matchAll(/(?<![\w#])todo ?#(\d{1,6})(?![\w#])/gi)) out.push({ id: m[1]!, start: m.index!, end: m.index! + m[0].length })
  return out
}
