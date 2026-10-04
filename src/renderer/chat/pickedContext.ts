/** One element picked on the Preview, as the message that carried it spelled it out. */
export interface Picked {
  /** "button on localhost:5287/shop": what it is and where from. */
  label: string
  from: string
  selector: string
  text?: string
  html?: string
  style?: string
  /** The picture of it that went with it (a path). */
  picture?: string
}

const FIELDS = [
  ['Selector: ', 'selector'],
  ['Text: ', 'text'],
  ['HTML: ', 'html'],
  ['Computed style: ', 'style']
] as const

const labelOf = (from: string, selector: string) => {
  const tag = /^[a-z][a-z0-9-]*/i.exec(selector)?.[0] ?? 'element'
  let page = from
  try {
    const u = new URL(from)
    page = `${u.host}${u.pathname === '/' ? '' : u.pathname}`
  } catch {
    /* a file name or anything else reads as it is */
  }
  return `${tag} on ${page}`
}

/**
 * A message that carries picked elements spells each one out in several lines (address, selector, text, HTML, style) and the
 * picture's path. They are pulled out here so the chat can show each as one small card instead of all that text.
 */
export function splitPicked(text: string): { picks: Picked[]; rest: string } {
  const lines = text.split('\n')
  const picks: Picked[] = []
  const rest: string[] = []
  for (let i = 0; i < lines.length; ) {
    const head = /^Element picked from (.+)$/.exec(lines[i]!)
    if (!head) {
      rest.push(lines[i++]!)
      continue
    }
    const start = i++
    const pick: Picked = { label: '', from: head[1]!, selector: '' }
    for (; i < lines.length; i++) {
      const line = lines[i]!
      const field = FIELDS.find(([prefix]) => line.startsWith(prefix))
      if (field) {
        const value = line.slice(field[0].length)
        pick[field[1]] = field[1] === 'text' ? value.replace(/^"(.*)"$/s, '$1') : value
      } else {
        const picture = /^Picture of it: @"(.+)"$/.exec(line)
        if (!picture) break
        pick.picture = picture[1]
      }
    }
    // Without a selector it is only words that start the same way.
    if (!pick.selector) rest.push(...lines.slice(start, i))
    else picks.push({ ...pick, label: labelOf(pick.from, pick.selector) })
  }
  return { picks, rest: rest.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+|\n+$/g, '') }
}
