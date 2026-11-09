/**
 * Small changes to a reply's HTML (after it is sanitized) so it reads better, for what agents already write: a paragraph that starts with
 * "Note:" or "Warning:" is drawn as the matching callout, a command the agent gives becomes a command row (with Copy and Run, added where
 * code blocks get theirs), a code block says its language, a bold lead-in opens a list item as its term, table cells that hold a number
 * line up on the right, and a numbered list that starts further on keeps its numbers.
 */
const KINDS: Record<string, string> = { note: 'Note', tip: 'Tip', important: 'Important', warning: 'Warning', caution: 'Caution' }

const CALLOUT = /<p>(?:<strong>)?(Note|Tip|Important|Warning|Caution):(?:<\/strong>)?\s*([\s\S]*?)<\/p>/g
const NUMBER = /^[-+−]?[₹$€£]?\d[\d,]*(?:\.\d+)?\s*(?:%|ms|s|m|h|[KMGT]i?B|x|×)?$/
const SHELLS = new Set(['bash', 'sh', 'shell', 'zsh', 'console', 'shell-session', 'terminal'])
// The programs a command given in a sentence starts with: enough to tell `ls -la` from `cartTotal`.
const PROGRAM = /^(?:ls|cd|cat|less|git|gh|npm|npx|pnpm|yarn|bun|bunx|node|deno|python3?|pip3?|uv|make|docker|kubectl|curl|wget|grep|rg|find|mkdir|rm|cp|mv|touch|echo|brew|cargo|go|rustc|ssh|scp|tail|head|open|code|chmod|chown|sudo|tsc|vitest|jest|pytest|eslint|prettier|claude)(?:\s|$)/
const isCommand = (code: string) => PROGRAM.test(code.replace(/&amp;/g, '&').trim())
const row = (code: string) => `<pre class="cmd" data-lang="sh"><code class="language-sh">${code}</code></pre>`
const cap = (t: string) => t.replace(/^[a-z]/, (c) => c.toUpperCase())

export function shapeReply(html: string): string {
  return html
    .replace(CALLOUT, (_, word: string, rest: string) => {
      const kind = word.toLowerCase()
      return `<div class="markdown-alert markdown-alert-${kind}"><p class="markdown-alert-title">${KINDS[kind]}</p><p>${cap(rest)}</p></div>`
    })
    // `ls -la` lists all files … → the command, then what it does.
    .replace(/<p><code>([^<]+)<\/code>\s*([^<]*(?:<(?!\/p>)[^<]*)*)<\/p>/g, (p, code: string, rest: string) => {
      if (!isCommand(code)) return p
      const why = rest.trim()
      return row(code) + (why ? `<p class="cmd-why">${cap(why)}</p>` : '')
    })
    // For files tracked by git only: `git ls-files`. → the sentence, then the command.
    .replace(/<p>([^<]*(?:<(?!\/p>|code>)[^<]*)*):\s*<code>([^<]+)<\/code>\.?<\/p>/g, (p, lead: string, code: string) => (isCommand(code) ? `<p>${lead}:</p>${row(code)}` : p))
    .replace(/<pre><code class="language-([\w+-]+)">([\s\S]*?)<\/code><\/pre>/g, (_, lang: string, body: string) => {
      const oneLine = SHELLS.has(lang) && body.replace(/\n$/, '').split('\n').length === 1
      return `<pre${oneLine ? ' class="cmd"' : ''} data-lang="${lang}"><code class="language-${lang}">${body}</code></pre>`
    })
    .replace(/<li>(\s*<p>)?<strong>/g, (_, p: string | undefined) => `<li class="has-term">${p ?? ''}<strong class="term">`)
    .replace(/<td>([^<]*)<\/td>/g, (cell, text: string) => (NUMBER.test(text.trim()) ? `<td class="num">${text}</td>` : cell))
    .replace(/<table>[\s\S]*?<\/table>/g, numberHeadings)
    .replace(/<ol start="(\d+)">/g, (_, n: string) => `<ol start="${n}" style="counter-reset: step ${Number(n) - 1}">`)
}

/** A column whose every cell is a number gets its heading on the right too, over its numbers. */
function numberHeadings(table: string): string {
  const rows = [...table.matchAll(/<tbody>([\s\S]*?)<\/tbody>/g)].flatMap((b) => [...b[1]!.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((r) => [...r[1]!.matchAll(/<td[^>]*>/g)].map((c) => c[0] === '<td class="num">')))
  if (!rows.length) return table
  let col = -1
  return table.replace(/<th>/g, () => {
    col++
    return rows.every((r) => r[col]) ? '<th class="num">' : '<th>'
  })
}
