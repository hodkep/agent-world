/** What the Code tab can show of a file besides its source: markdown and html as the page they make, a pdf as a pdf (it is not text and is never opened for editing). */
export function fileShows(path: string): 'markdown' | 'html' | 'pdf' | 'source' {
  if (/\.(md|markdown|mdx)$/i.test(path)) return 'markdown'
  if (/\.html?$/i.test(path)) return 'html'
  if (/\.pdf$/i.test(path)) return 'pdf'
  return 'source'
}
