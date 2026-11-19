/** What the Code tab can show of a file besides its source: markdown and html as the page they make, a pdf as a pdf, and Word, Excel and PowerPoint files in the read-only viewer (none of them is text, so none is opened for editing). A CSV is text to edit, and can be read as a table. */
export function fileShows(path: string): 'markdown' | 'html' | 'pdf' | 'word' | 'sheet' | 'slides' | 'csv' | 'source' {
  if (/\.(md|markdown|mdx)$/i.test(path)) return 'markdown'
  if (/\.html?$/i.test(path)) return 'html'
  if (/\.pdf$/i.test(path)) return 'pdf'
  if (/\.docx$/i.test(path)) return 'word'
  if (/\.xlsx$/i.test(path)) return 'sheet'
  if (/\.pptx$/i.test(path)) return 'slides'
  if (/\.(csv|tsv)$/i.test(path)) return 'csv'
  return 'source'
}
