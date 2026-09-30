import { describe, expect, it } from 'vitest'
import { reviewRequest } from './review'

describe('review request', () => {
  it('names the branch, the base and where the work is, and asks for a verdict without edits', () => {
    const t = reviewRequest('ada', 'aw/ada', 'main', '/w/ada')
    expect(t).toContain('aw/ada')
    expect(t).toContain('git diff main...aw/ada')
    expect(t).toContain('/w/ada')
    expect(t).toMatch(/do not (edit|modify|change)/i)
    expect(t).toContain('to="ada"')
  })

  it('cannot be turned into extra instructions by an odd branch or path name', () => {
    const t = reviewRequest('ada', 'aw/x`; rm -rf /`', 'main', "/w/a b'c")
    expect(t).not.toContain('`; rm')
    expect(t).not.toContain("b'c")
  })
})
