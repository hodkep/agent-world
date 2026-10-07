import { describe, expect, it } from 'vitest'
import { parseDoc, renderDoc, slug, tokens } from './doc'

describe('a library document: front matter and a body', () => {
  it('reads the name, the description and the body', () => {
    const d = parseDoc('---\nname: tdd\ndescription: Write the test first.\n---\n\nStep one.\nStep two.\n')
    expect(d).toMatchObject({ name: 'tdd', description: 'Write the test first.', body: 'Step one.\nStep two.' })
  })
  it('takes a quoted description and a folded one that runs over several lines', () => {
    expect(parseDoc('---\nname: a\ndescription: "Quoted: with a colon"\n---\nx').description).toBe('Quoted: with a colon')
    expect(parseDoc('---\nname: a\ndescription: >\n  First part\n  second part\nother: 1\n---\nx').description).toBe('First part second part')
  })
  it('keeps every other key, and falls back to the first line of words when there is no front matter', () => {
    expect(parseDoc('---\nname: a\ndescription: d\nsource: ~/.claude/skills\n---\nx').meta.source).toBe('~/.claude/skills')
    const plain = parseDoc('# Title\n\nFirst real line.\nMore.')
    expect(plain).toMatchObject({ name: '', description: 'First real line.' })
    expect(plain.body).toContain('More.')
  })
  it('writes what it reads back', () => {
    const text = renderDoc({ name: 'x', description: 'one line', body: 'hello', meta: { source: 'new' } })
    expect(parseDoc(text)).toMatchObject({ name: 'x', description: 'one line', body: 'hello', meta: { source: 'new' } })
  })
  it('makes safe ids and estimates tokens as characters over four', () => {
    expect(slug('Test-Driven Development!')).toBe('test-driven-development')
    expect(slug('../../etc/passwd')).toBe('etc-passwd')
    expect(slug('')).toBe('')
    expect(tokens('abcdefgh')).toBe(2)
  })
})
