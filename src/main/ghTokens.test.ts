import { describe, expect, it, vi } from 'vitest'
import { createGhTokens } from './ghTokens'

// `ask` is the slow lookup done in the background at start-up; `askNow` the short one done when an agent starts and the token is not known.
const make = (tokens: Record<string, string | undefined>) => {
  const ask = vi.fn(async (login: string) => tokens[login])
  const askNow = vi.fn((login: string) => tokens[login])
  return { ask, askNow, t: createGhTokens(ask, askNow) }
}

describe("the GitHub login tokens an agent starts with", () => {
  it('gives a token fetched by the refresh without asking again', async () => {
    const { t, askNow } = make({ work: 'tok-work' })
    await t.refresh(['work'])
    expect(t.get('work')).toBe('tok-work')
    expect(askNow).not.toHaveBeenCalled()
  })

  it('asks once more at the moment an agent starts when the refresh has not got it yet, and keeps what it gets', () => {
    const { t, askNow } = make({ work: 'tok-work' })
    expect(t.get('work')).toBe('tok-work')
    expect(t.get('work')).toBe('tok-work')
    expect(askNow).toHaveBeenCalledTimes(1)
  })

  it('gives nothing for a login that is signed out, and asks again next time in case it was signed in since', () => {
    const { t, askNow } = make({ work: undefined })
    expect(t.get('work')).toBeUndefined()
    expect(t.get('work')).toBeUndefined()
    expect(askNow).toHaveBeenCalledTimes(2)
  })

  it('refreshes every login once, even when two profiles share one', async () => {
    const { t, ask } = make({ a: '1', b: '2' })
    await t.refresh(['a', 'b', 'a'])
    expect(ask.mock.calls.map((c) => c[0])).toEqual(['a', 'b'])
  })

  it('forgets a login that went signed out at the next refresh', async () => {
    const tokens: Record<string, string | undefined> = { work: 'tok-work' }
    const { t, askNow } = make(tokens)
    await t.refresh(['work'])
    tokens.work = undefined
    await t.refresh(['work'])
    expect(t.get('work')).toBeUndefined()
    expect(askNow).toHaveBeenCalledTimes(1) // it asked again, found none, and the map has none
  })
})
