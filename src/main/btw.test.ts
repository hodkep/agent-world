import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { btwOverlay } from './btw'

const fixture = (n: string) => readFileSync(join(__dirname, 'fixtures', n), 'utf8')

describe('the /btw side-question overlay', () => {
  it('shows the question while Claude is still answering', () => {
    expect(btwOverlay(fixture('btw-pending.txt'))).toEqual({ question: 'what is 2+2?', answer: null })
  })
  it('reads the answer once it is there', () => {
    expect(btwOverlay(fixture('btw-answer.txt'))).toEqual({ question: 'what is 2+2?', answer: 'Two plus two is 4.' })
  })
  it('copes with blank lines around the question', () => {
    expect(btwOverlay('▔▔▔▔▔▔▔▔▔▔\n\n    /btw why?\n\n      Because.\n\n    Esc to close')).toEqual({ question: 'why?', answer: 'Because.' })
  })
  it('sees nothing on an ordinary screen', () => {
    expect(btwOverlay('  hello\n❯ \n  ⏸ manual mode on')).toBeNull()
  })
})
