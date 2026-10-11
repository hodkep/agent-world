const PAGE = /\.(html?|pdf)$/i

/** What was typed into the Preview bar as a page on this computer: an absolute path, ~/…, C:\…, or a file: address; as a plain path. Null for anything else. */
export function pagePath(text: string): string | null {
  let t = text.trim()
  if (/^file:\/\//i.test(t)) {
    try {
      t = decodeURIComponent(t.replace(/^file:\/\//i, ''))
    } catch {
      return null
    }
  }
  const rooted = t.startsWith('/') || t.startsWith('~/') || /^[A-Za-z]:[\\/]/.test(t)
  return rooted && PAGE.test(t) ? t : null
}

const OPENERS = new Set(['open', 'xdg-open', 'gnome-open', 'wslview', 'start', 'explorer', 'explorer.exe'])
/** Options of `open` that are followed by a value (the application), which is not the page. */
const WITH_VALUE = new Set(['-a', '-b', '--args'])

/** A shell line as its commands, each as words: quotes are kept together, and the separators (&&, ||, ;, |, &, newline) end a command. */
function commands(line: string): string[][] {
  const out: string[][] = []
  let words: string[] = []
  let word = ''
  let has = false
  let quote: '"' | "'" | null = null
  const endWord = () => {
    if (has) words.push(word)
    word = ''
    has = false
  }
  const endCommand = () => {
    endWord()
    if (words.length) out.push(words)
    words = []
  }
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!
    if (quote) {
      if (c === quote) quote = null
      else word += c
    } else if (c === '"' || c === "'") (quote = c, (has = true))
    else if (c === '\\' && line[i + 1] === ' ') (word += ' ', i++, (has = true))
    else if (c === ' ' || c === '\t') endWord()
    else if (c === ';' || c === '|' || c === '&' || c === '\n') endCommand()
    else (word += c, (has = true))
  }
  endCommand()
  return out
}

/** The pages (files ending .html or .htm, or file: addresses to them) a tool call opens in a browser, as written. */
export function pagesOpenedBy(toolInputJson: string): string[] {
  let input: Record<string, unknown>
  try {
    input = JSON.parse(toolInputJson) as Record<string, unknown>
  } catch {
    return []
  }
  const found: string[] = []
  const isPage = (w: string) => /\.html?$/i.test(w) && !/^https?:\/\//i.test(w)
  // A browser tool sent to a file address.
  if (typeof input.url === 'string' && /^file:\/\//i.test(input.url) && isPage(input.url)) found.push(input.url)
  if (typeof input.command === 'string') {
    for (let words of commands(input.command)) {
      // `cmd /c start …` and `sudo open …` run the same thing.
      while (words[0] && /^(sudo|cmd|cmd\.exe)$/i.test(words[0])) words = words.slice(words[1]?.toLowerCase() === '/c' ? 2 : 1)
      if (!words[0] || !OPENERS.has(words[0].toLowerCase())) continue
      for (let i = 1; i < words.length; i++) {
        const w = words[i]!
        if (WITH_VALUE.has(w)) i++
        else if (!w.startsWith('-') && isPage(w)) found.push(w)
      }
    }
  }
  return found
}
