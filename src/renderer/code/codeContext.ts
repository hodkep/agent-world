/** A piece of code from a file, as the message that carried it spells it out; the chat reads it back as a card. */
export interface CodeBlock {
  /** "tree.ts:4–6" */
  label: string
  path: string
  lines: string
  /** "after the change", or empty. */
  note: string
  code: string
  /** What the same place was before a change, when the selection reached into one. */
  before?: { lines: string; code: string }
}

const range = (a: number, b: number) => (a === b ? `${a}` : `${a}–${b}`)
const lineWord = (a: number, b: number) => (a === b ? 'line' : 'lines')

/** The fence language: the file's extension, when it has a short one. */
const langOf = (path: string) => {
  const ext = /\.([a-z0-9]{1,5})$/i.exec(path.slice(path.lastIndexOf('/') + 1))?.[1]
  return ext ? ext.toLowerCase() : ''
}

/** A fence one backtick longer than any run in the code, so the code can hold fences of its own. */
const fenced = (code: string, lang: string) => {
  const fence = '`'.repeat(Math.max(2, ...[...code.matchAll(/`+/g)].map((m) => m[0].length)) + 1)
  return `${fence}${lang}\n${code}\n${fence}`
}

/** The words that go into the message for some selected code: which file, which lines, the code, and for a change what it was before. */
export function codeContext(o: { path: string; from: number; to: number; code: string; after?: boolean; before?: { from: number; to: number; code: string } }): string {
  const lang = langOf(o.path)
  const head = `Code from ${o.path}, ${lineWord(o.from, o.to)} ${range(o.from, o.to)}${o.after ? ' (after the change)' : ''}:`
  const old = o.before ? `\nBefore the change, ${lineWord(o.before.from, o.before.to)} ${range(o.before.from, o.before.to)} ${o.before.from === o.before.to ? 'was' : 'were'}:\n${fenced(o.before.code, lang)}` : ''
  return `${head}\n${fenced(o.code, lang)}${old}`
}

const HEAD = /^Code from (.+), (?:line|lines) (\d+(?:–\d+)?)(?: \(([^)]+)\))?:$/
const BEFORE = /^Before the change, (?:line|lines) (\d+(?:–\d+)?) (?:was|were):$/

/** Reads the fenced block that starts at `lines[i]`, giving its code and where it ended; null when it is not one. */
function readFence(lines: string[], i: number): { code: string; next: number } | null {
  const open = /^(`{3,})\w*$/.exec(lines[i] ?? '')
  if (!open) return null
  const end = lines.indexOf(open[1]!, i + 1)
  return end < 0 ? null : { code: lines.slice(i + 1, end).join('\n'), next: end + 1 }
}

/** Takes the code blocks out of a sent message, leaving the words. */
export function splitCode(text: string): { blocks: CodeBlock[]; rest: string } {
  const lines = text.split('\n')
  const blocks: CodeBlock[] = []
  const rest: string[] = []
  for (let i = 0; i < lines.length; ) {
    const head = HEAD.exec(lines[i]!)
    const body = head ? readFence(lines, i + 1) : null
    if (!head || !body) {
      rest.push(lines[i++]!)
      continue
    }
    const [, path, span, note] = head
    const block: CodeBlock = { label: `${path!.slice(path!.lastIndexOf('/') + 1)}:${span}`, path: path!, lines: span!, note: note ?? '', code: body.code }
    i = body.next
    const was = BEFORE.exec(lines[i] ?? '')
    const old = was ? readFence(lines, i + 1) : null
    if (was && old) (block.before = { lines: was[1]!, code: old.code }, (i = old.next))
    blocks.push(block)
  }
  return { blocks, rest: rest.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+|\n+$/g, '') }
}
