import { describe, expect, it } from 'vitest'
import { findFolderCandidates, findPathCandidates, linkName } from './links'

const found = (t: string) => findPathCandidates(t).map((c) => c.text)

describe('paths in a sentence', () => {
  it('finds absolute, home, relative and bare file names', () => {
    expect(found('Saved to /private/tmp/claude-501/scratchpad/mcp-cards-preview.html now')).toEqual(['/private/tmp/claude-501/scratchpad/mcp-cards-preview.html'])
    expect(found('open ~/notes/a.md and ./src/app.ts, then ../x/y.json.')).toEqual(['~/notes/a.md', './src/app.ts', '../x/y.json'])
    expect(found('I changed src/renderer/App.tsx and health.ts')).toEqual(['src/renderer/App.tsx', 'health.ts'])
  })
  it('does not take web addresses, versions, e-mails or plain words', () => {
    expect(found('see https://example.com/docs/page.html for more')).toEqual([])
    expect(found('version 1.2.3 and a@b.com and and/or e.g. so')).toEqual([])
    expect(found('Done. I made deck.pptx and r2.xlsx.')).toEqual(['deck.pptx', 'r2.xlsx'])
  })
  it('stops before trailing punctuation', () => {
    expect(found('(see docs/readme.md).')).toEqual(['docs/readme.md'])
  })
  it('names a link after the file', () => {
    expect(linkName('/a/b/report.html')).toBe('report.html')
    expect(linkName('report.html')).toBe('report.html')
  })
})

const folders = (t: string) => findFolderCandidates(t).map((c) => c.text)

describe('folders in a sentence', () => {
  it('finds a relative folder written with its trailing slash, and an absolute or home folder with no extension', () => {
    expect(folders('it is in src/renderer/panel/ next to the rest')).toEqual(['src/renderer/panel/'])
    expect(folders('look at the src/ folder and ./docs/guide/ too')).toEqual(['src/', './docs/guide/'])
    expect(folders('saved under ~/Documents/work and /Users/pratik/projects/shop.')).toEqual(['~/Documents/work', '/Users/pratik/projects/shop'])
  })
  it('does not take a web address, a plain word, a relative path with no slash at the end, or a file', () => {
    expect(folders('see https://github.com/hodkep/agent-world/ for more')).toEqual([])
    expect(folders('and/or either or src/renderer')).toEqual([])
    expect(folders('I changed /Users/pratik/a/b.ts and src/App.tsx')).toEqual([])
  })
  it('names a folder link after the folder, without its slash', () => {
    expect(linkName('src/renderer/panel/')).toBe('panel')
    expect(linkName('~/Documents/work')).toBe('work')
  })
})
