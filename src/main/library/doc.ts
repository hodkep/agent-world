/** Words to tokens, close enough to count a budget by: four characters make about one token. */
export const tokens = (s: string) => Math.ceil(s.length / 4)

/** A safe id from a name: lower case, dashes, nothing that could reach outside a folder. */
export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)

export interface Doc {
  name: string
  description: string
  body: string
  /** Every other key of the front matter. */
  meta: Record<string, string>
}

const unquote = (v: string) => v.trim().replace(/^(["'])([\s\S]*)\1$/, '$2')

/** A skill, instruction or prompt as a file: a few `key: value` lines between `---` marks, then the text. */
export function parseDoc(text: string): Doc {
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text)
  const meta: Record<string, string> = {}
  if (m) {
    const lines = m[1]!.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      const kv = /^([\w-]+):\s*(.*)$/.exec(lines[i]!)
      if (!kv) continue
      let value = kv[2]!
      // A folded or literal block: the indented lines after the key are its text.
      if (/^[>|][+-]?$/.test(value.trim())) {
        const parts: string[] = []
        while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1]!)) parts.push(lines[++i]!.trim())
        value = parts.join(' ')
      }
      meta[kv[1]!] = unquote(value)
    }
  }
  const body = (m ? text.slice(m[0].length) : text).replace(/^\s*\n/, '').trim()
  const { name = '', description, ...rest } = meta
  const fallback = body.split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('#')) ?? ''
  return { name, description: description ?? fallback, body, meta: rest }
}

export function renderDoc(d: Pick<Doc, 'name' | 'description' | 'body'> & { meta?: Record<string, string> }): string {
  const extra = Object.entries(d.meta ?? {}).map(([k, v]) => `${k}: ${v}`)
  return `---\nname: ${d.name}\ndescription: ${d.description.replace(/\n/g, ' ')}\n${extra.length ? extra.join('\n') + '\n' : ''}---\n\n${d.body}\n`
}
