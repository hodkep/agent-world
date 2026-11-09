import { describe, expect, it } from 'vitest'
import { lineDelta, resultPreview, serverColor } from './instruments'
import { testResult } from './stepGroups'

describe('the numbers on an edit sheet', () => {
  it('counts the lines added and removed, a line kept being neither', () => {
    expect(lineDelta('a\nb\nc', 'a\nB\nc\nd')).toEqual({ added: 2, removed: 1 })
    expect(lineDelta('', 'one\ntwo')).toEqual({ added: 2, removed: 0 })
    expect(lineDelta('x', 'x')).toEqual({ added: 0, removed: 0 })
  })
})

describe('the colour of an MCP server\'s plate', () => {
  it('is the one people know for the common servers, and always the same one for any other', () => {
    expect(serverColor('playwright')).toBe('#45ba4b')
    expect(serverColor('claude_ai_Slack')).toBe('#e0567f')
    expect(serverColor('claude_ai_Linear')).toBe('#8b7cf6')
    expect(serverColor('my-own-server')).toBe(serverColor('my-own-server'))
    expect(serverColor('my-own-server')).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('what an MCP result shows without opening it', () => {
  it('draws a list of records as a table of its first rows, with how many there are', () => {
    const p = resultPreview(JSON.stringify([{ id: 1041, total: 12.3, status: 'paid' }, { id: 1042, total: 0.3, status: 'paid' }, { id: 1043, total: 88, status: 'open' }]))
    expect(p).toEqual({ kind: 'table', cols: ['id', 'total', 'status'], rows: [['1041', '12.3', 'paid'], ['1042', '0.3', 'paid'], ['1043', '88', 'open']], total: 3 })
  })

  it('finds the records inside an object that holds one list of them', () => {
    const p = resultPreview(JSON.stringify({ issues: [{ id: 'CHK-41', title: 'Totals off' }, { id: 'CHK-38', title: 'Rounding' }], cursor: null }))
    expect(p).toMatchObject({ kind: 'table', cols: ['id', 'title'], total: 2 })
  })

  it('keeps a table small: five rows and five columns at most, nested values in short', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ a: i, b: 2, c: 3, d: 4, e: 5, f: 6, g: { deep: true } }))
    const p = resultPreview(JSON.stringify(many))
    expect(p).toMatchObject({ kind: 'table', total: 9 })
    if (p?.kind !== 'table') throw new Error('not a table')
    expect(p.rows).toHaveLength(5)
    expect(p.cols).toHaveLength(5)
  })

  it('draws a list of words as a list, and an object as names and values', () => {
    expect(resultPreview('["#release", "#general"]')).toEqual({ kind: 'list', items: ['#release', '#general'], total: 2 })
    expect(resultPreview('{"ok": true, "channel": "#release", "ts": "1731.2"}')).toEqual({ kind: 'kv', pairs: [['ok', 'true'], ['channel', '#release'], ['ts', '1731.2']] })
  })

  it('has nothing to show for plain text or broken JSON', () => {
    expect(resultPreview('Page Title: Cart')).toBeNull()
    expect(resultPreview('{"a": ')).toBeNull()
    expect(resultPreview('')).toBeNull()
  })
})

describe('the result on a terminal slip', () => {
  it('is the runner\'s own count, or nothing when it printed none', () => {
    expect(testResult('npm test', '# pass 4\n# fail 0')).toEqual({ text: 'tests 4 passed', bad: false })
    expect(testResult('ls -la', 'total 8')).toBeNull()
  })
})
