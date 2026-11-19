import { describe, expect, it } from 'vitest'
import { cellsContext, rangeLabel, wordsContext } from './selection'

describe('the label of a range of cells', () => {
  it('names the sheet and the corners', () => {
    expect(rangeLabel('Budget', { r1: 1, c1: 1, r2: 3, c2: 3 })).toBe('Budget!B2:D4')
  })
  it('names one cell once, and a column past Z in letters', () => {
    expect(rangeLabel('Budget', { r1: 0, c1: 0, r2: 0, c2: 0 })).toBe('Budget!A1')
    expect(rangeLabel('S', { r1: 0, c1: 26, r2: 0, c2: 27 })).toBe('S!AA1:AB1')
  })
  it('leaves the sheet out for a CSV, which has none', () => {
    expect(rangeLabel('', { r1: 1, c1: 1, r2: 1, c2: 2 })).toBe('B2:C2')
  })
  it('reads a range dragged backwards', () => {
    expect(rangeLabel('S', { r1: 3, c1: 3, r2: 1, c2: 1 })).toBe('S!B2:D4')
  })
})

describe('selected words as a message', () => {
  it('quotes them with the file name', () => {
    expect(wordsContext('plan.docx', 'one\ntwo')).toEqual({ label: 'plan.docx, selection', text: 'From plan.docx:\n> one\n> two' })
  })
  it('says which slide when it is a deck', () => {
    expect(wordsContext('deck.pptx', 'Ship it', 'slide 2')).toEqual({ label: 'deck.pptx, slide 2', text: 'From deck.pptx, slide 2:\n> Ship it' })
  })
})

describe('selected cells as a message', () => {
  const grid = [
    ['Item', 'Q1', 'Q2', 'Q3'],
    ['Hosting', '1,200', '1,350', '1,400'],
    ['Support', '800', '950', '990'],
    ['Licences', '400', '400', '420']
  ]
  it('is a small table with the header row and the file and range', () => {
    const r = cellsContext('budget.xlsx', 'Budget', grid, { r1: 1, c1: 1, r2: 2, c2: 3 })
    expect(r.label).toBe('budget.xlsx, Budget!B2:D3')
    expect(r.text).toBe('From budget.xlsx, Budget!B2:D3 (header row included):\n| Q1 | Q2 | Q3 |\n| --- | --- | --- |\n| 1,200 | 1,350 | 1,400 |\n| 800 | 950 | 990 |')
  })
  it('does not repeat the header when the selection starts on it', () => {
    const r = cellsContext('budget.xlsx', 'Budget', grid, { r1: 0, c1: 0, r2: 1, c2: 1 })
    expect(r.text).toBe('From budget.xlsx, Budget!A1:B2:\n| Item | Q1 |\n| --- | --- |\n| Hosting | 1,200 |')
  })
  it('keeps a pipe or a new line inside a cell from breaking the table', () => {
    const r = cellsContext('a.csv', '', [['h'], ['a|b\nc']], { r1: 1, c1: 0, r2: 1, c2: 0 })
    expect(r.text).toContain('| a\\|b c |')
  })
  it('cuts a huge selection at 500 cells and says so', () => {
    const big = Array.from({ length: 300 }, (_, r) => Array.from({ length: 4 }, (_, c) => `${r}.${c}`))
    const r = cellsContext('big.csv', '', big, { r1: 0, c1: 0, r2: 299, c2: 3 })
    expect(r.text).toContain('(first 125 of 300 rows, 500 cells)')
    expect(r.text.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| ---')).length).toBe(125)
  })
})
