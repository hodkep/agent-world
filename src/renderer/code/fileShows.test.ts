import { describe, expect, it } from 'vitest'
import { fileShows } from './fileShows'

describe('what the Code tab shows for a file', () => {
  it('lets markdown and html be read as a page, with the source one click away', () => {
    expect(fileShows('docs/README.md')).toBe('markdown')
    expect(fileShows('notes.markdown')).toBe('markdown')
    expect(fileShows('site/report.html')).toBe('html')
    expect(fileShows('OLD.HTM')).toBe('html')
  })

  it('shows a pdf as a pdf, never as text to edit', () => {
    expect(fileShows('reports/Q3.PDF')).toBe('pdf')
  })

  it('shows anything else as source', () => {
    expect(fileShows('src/cart.ts')).toBe('source')
    expect(fileShows('htmlish.txt')).toBe('source')
    expect(fileShows('pdf')).toBe('source')
  })
})
