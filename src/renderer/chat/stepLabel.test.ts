import { describe, expect, it } from 'vitest'
import type { Row } from './format'
import { groupLabel } from './stepGroups'

let n = 0
const step = (name: string, input: Record<string, unknown>, text = '', isError = false) => ({ kind: 'tool', id: `t${n++}`, run: { name, input, result: { text, isError } } }) as Extract<Row, { kind: 'tool' }>

describe('the line a folded group of steps says', () => {
  it('says what was done, result first', () => {
    const label = groupLabel([
      step('Read', { file_path: '/a.ts' }),
      step('Read', { file_path: '/b.ts' }),
      step('Read', { file_path: '/a.ts' }),
      step('Grep', { pattern: 'cart' }),
      step('Bash', { command: 'ls' }),
      step('Bash', { command: 'pnpm test' }, 'Tests  41 passed (41)')
    ])
    expect(label).toEqual({ text: 'Read 2 files · searched 1 · ran 2 commands', tests: { text: 'tests 41 passed', bad: false } })
  })

  it('marks failing tests, and says a single file and command in the singular', () => {
    const label = groupLabel([step('Read', { file_path: '/a.ts' }), step('Bash', { command: 'pnpm test' }, 'Tests  2 failed | 39 passed (41)', true)])
    expect(label).toEqual({ text: 'Read 1 file · ran 1 command', tests: { text: 'tests 2 failed', bad: true } })
  })

  it('reads the counts of jest, pytest and node\'s own runner', () => {
    expect(groupLabel([step('Bash', { command: 'npx jest' }, 'Tests:       2 failed, 39 passed, 41 total')]).tests).toEqual({ text: 'tests 2 failed', bad: true })
    expect(groupLabel([step('Bash', { command: 'pytest -q' }, '40 passed in 1.2s')]).tests).toEqual({ text: 'tests 40 passed', bad: false })
    expect(groupLabel([step('Bash', { command: 'npm test 2>&1 | tail -12' }, '# tests 2\n# pass 2\n# fail 0')]).tests).toEqual({ text: 'tests 2 passed', bad: false })
    expect(groupLabel([step('Bash', { command: 'npm test | tail' }, '# tests 3\n# pass 2\n# fail 1')]).tests).toEqual({ text: 'tests 1 failed', bad: true })
  })

  it('says nothing about tests when the runner printed no counts: a pipe hides the exit code, so success cannot be told from it', () => {
    expect(groupLabel([step('Bash', { command: 'npm test 2>&1 | tail -3' }, 'done')]).tests).toBeUndefined()
    expect(groupLabel([step('Bash', { command: 'npm run lint | tail' }, 'lint: "var" in cart.js')]).tests).toBeUndefined()
  })

  it('starts with a capital whatever comes first', () => {
    expect(groupLabel([step('Bash', { command: 'ls' }), step('Bash', { command: 'pwd' })]).text).toBe('Ran 2 commands')
  })
})
