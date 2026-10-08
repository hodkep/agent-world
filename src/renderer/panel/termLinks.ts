export interface TermLink {
  kind: 'url' | 'file'
  /** The address, or the path as printed. */
  target: string
  line?: number
  col?: number
  /** 0-based, end exclusive: where it sits in the line. */
  start: number
  end: number
}

const URL_RE = /https?:\/\/[^\s<>"'`]+/g
const WORD_RE = /[^\s'"`()<>[\]{}|,;=]+/g
// A path has a slash in it or a file extension a developer would know; plain words with a dot (e.g. node.js) do not count.
const KNOWN = new Set(['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'json', 'md', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift', 'c', 'h', 'cc', 'cpp', 'hpp', 'cs', 'css', 'scss', 'html', 'vue', 'svelte', 'yml', 'yaml', 'toml', 'sh', 'zsh', 'sql', 'txt', 'log', 'lock', 'xml', 'php', 'png', 'jpg', 'svg', 'pdf'])
const TRAIL = /[.,;:!?)\]}]+$/
const PLACE = /^(.*?)(?::(\d+))?(?::(\d+))?$/

/** The web addresses and file paths in one line of terminal output. */
export function findLinks(text: string): TermLink[] {
  const out: TermLink[] = []
  for (const m of text.matchAll(URL_RE)) {
    const target = m[0].replace(TRAIL, '')
    out.push({ kind: 'url', target, start: m.index!, end: m.index! + target.length })
  }
  for (const m of text.matchAll(WORD_RE)) {
    const word = m[0].replace(TRAIL, '')
    const start = m.index!
    const end = start + word.length
    if (!word || out.some((u) => start < u.end && end > u.start)) continue
    const [, target = '', line, col] = PLACE.exec(word) ?? []
    const name = target.slice(target.lastIndexOf('/') + 1)
    const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : ''
    const pathy = target.includes('/') && /[A-Za-z]/.test(name) && (ext !== '' || target.startsWith('.') || target.startsWith('/'))
    if (!(pathy || (name.length > ext.length + 1 && KNOWN.has(ext)))) continue
    if (target.includes('//') || /^\d+(\.\d+)+$/.test(target)) continue
    out.push({ kind: 'file', target, ...(line ? { line: Number(line) } : {}), ...(col ? { col: Number(col) } : {}), start, end })
  }
  return out.sort((a, b) => a.start - b.start)
}
