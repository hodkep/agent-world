import { describe, expect, it } from 'vitest'
import { codeContext, splitCode } from './codeContext'

describe('code sent as context', () => {
  it('names the file and the lines and puts the code in a fence', () => {
    expect(codeContext({ path: 'src/a.ts', from: 4, to: 6, code: 'const x = 1\nconst y = 2' })).toBe('Code from src/a.ts, lines 4–6:\n```ts\nconst x = 1\nconst y = 2\n```')
  })

  it('says "line" for one line, and takes the fence language from the file name', () => {
    expect(codeContext({ path: 'README.md', from: 2, to: 2, code: '# hi' })).toBe('Code from README.md, line 2:\n```md\n# hi\n```')
    expect(codeContext({ path: 'Makefile', from: 1, to: 1, code: 'all:' })).toBe('Code from Makefile, line 1:\n```\nall:\n```')
  })

  it('says it is the code after a change, and what those lines were before', () => {
    const t = codeContext({ path: 'a.ts', from: 3, to: 3, code: 'new()', after: true, before: { from: 3, to: 4, code: 'old()\nolder()' } })
    expect(t).toBe('Code from a.ts, line 3 (after the change):\n```ts\nnew()\n```\nBefore the change, lines 3–4 were:\n```ts\nold()\nolder()\n```')
  })

  it('uses a longer fence when the code has one in it', () => {
    const t = codeContext({ path: 'a.md', from: 1, to: 3, code: '```js\nx\n```' })
    expect(t.split('\n')[1]).toBe('````md')
    expect(t.endsWith('\n````')).toBe(true)
  })
})

describe('code context read back out of a sent message', () => {
  const one = codeContext({ path: 'src/a.ts', from: 4, to: 6, code: 'const x = 1\nconst y = 2' })

  it('takes each block out of the words and keeps its parts', () => {
    const { blocks, rest } = splitCode(`${one}\n\nwhy is this slow?`)
    expect(rest).toBe('why is this slow?')
    expect(blocks).toEqual([{ label: 'a.ts:4–6', path: 'src/a.ts', lines: '4–6', note: '', code: 'const x = 1\nconst y = 2' }])
  })

  it('reads the after-the-change note and the before code', () => {
    const t = codeContext({ path: 'a.ts', from: 3, to: 3, code: 'new()', after: true, before: { from: 3, to: 4, code: 'old()\nolder()' } })
    expect(splitCode(t).blocks).toEqual([{ label: 'a.ts:3', path: 'a.ts', lines: '3', note: 'after the change', code: 'new()', before: { lines: '3–4', code: 'old()\nolder()' } }])
  })

  it('finds several, and reads code that has a fence of its own', () => {
    const fenced = codeContext({ path: 'a.md', from: 1, to: 3, code: '```js\nx\n```' })
    const { blocks, rest } = splitCode(`${one}\n\n${fenced}\n\nokay?`)
    expect(blocks.map((b) => b.label)).toEqual(['a.ts:4–6', 'a.md:1–3'])
    expect(blocks[1]!.code).toBe('```js\nx\n```')
    expect(rest).toBe('okay?')
  })

  it('leaves alone text that only looks a little like it', () => {
    for (const t of ['Code from the top, please', 'Code from a.ts, lines 1–2:\nno fence here']) expect(splitCode(t)).toEqual({ blocks: [], rest: t })
  })
})
