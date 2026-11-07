import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAccess } from './access'

describe('which addresses a tool may open', () => {
  const ask = vi.fn()
  beforeEach(() => (vi.useFakeTimers(), ask.mockClear()))
  afterEach(() => vi.useRealTimers())

  it('lets a page on this computer open at once, and asks no one', async () => {
    const a = createAccess({ ask })
    expect(await a.mayOpen('a1', 'http://localhost:5173/x')).toBeNull()
    expect(await a.mayOpen('a1', 'http://127.0.0.1:3000/')).toBeNull()
    expect(ask).not.toHaveBeenCalled()
  })

  it('lets a site the person already allowed open at once', async () => {
    const a = createAccess({ ask })
    a.setAllowed(['example.com'])
    expect(await a.mayOpen('a1', 'https://example.com/page')).toBeNull()
    expect(ask).not.toHaveBeenCalled()
  })

  it('asks the person about a site not allowed yet, and waits for the answer', async () => {
    const a = createAccess({ ask })
    let got: string | null | undefined
    void a.mayOpen('a1', 'https://example.com/page').then((r) => (got = r))
    await vi.advanceTimersByTimeAsync(1000)
    expect(ask).toHaveBeenCalledWith({ agentId: 'a1', url: 'https://example.com/page' })
    expect(got).toBeUndefined()
    a.setAllowed(['example.com'])
    await vi.advanceTimersByTimeAsync(0)
    expect(got).toBeNull()
  })

  it('refuses, saying so, when the person says not now', async () => {
    const a = createAccess({ ask })
    const p = a.mayOpen('a1', 'https://example.com/')
    a.answer('a1', 'https://example.com/', false)
    expect(await p).toMatch(/not now.*example\.com/i)
  })

  it('gives the tool an answer before the tool gives up itself: the person is asked, and the tool is told to try the same command again after they answer', async () => {
    const a = createAccess({ ask })
    const p = a.mayOpen('a1', 'https://example.com/')
    await vi.advanceTimersByTimeAsync(14_000)
    let early: string | null | undefined
    void p.then((r) => (early = r))
    await vi.advanceTimersByTimeAsync(0)
    expect(early).toBeUndefined() // still within what a tool waits for
    await vi.advanceTimersByTimeAsync(2_000)
    const why = (await p)!
    expect(why).toMatch(/waiting for the person/i)
    expect(why).toMatch(/example\.com/)
    expect(why).toMatch(/Preview/)
    expect(why).toMatch(/again|retry/i)
  })

  it('remembers a site the person allows after the tool was told to wait, so the same command goes straight through', async () => {
    const a = createAccess({ ask, timeoutMs: 5000 })
    const p = a.mayOpen('a1', 'https://example.com/')
    await vi.advanceTimersByTimeAsync(5001)
    await p
    a.setAllowed(['example.com'])
    expect(await a.mayOpen('a1', 'https://example.com/again')).toBeNull()
  })

  it('asks again when the site is tried again after the tool was told to wait and nobody has allowed it', async () => {
    const a = createAccess({ ask, timeoutMs: 5000 })
    const p = a.mayOpen('a1', 'https://example.com/')
    await vi.advanceTimersByTimeAsync(5001)
    await p
    ask.mockClear()
    void a.mayOpen('a1', 'https://example.com/')
    expect(ask).toHaveBeenCalledTimes(1)
  })

  it('asks once for the same site from the same agent while it waits', async () => {
    const a = createAccess({ ask })
    const p1 = a.mayOpen('a1', 'https://example.com/one')
    const p2 = a.mayOpen('a1', 'https://example.com/two')
    expect(ask).toHaveBeenCalledTimes(1)
    a.setAllowed(['example.com'])
    expect(await Promise.all([p1, p2])).toEqual([null, null])
  })

  it('asks separately for another agent or another site', async () => {
    const a = createAccess({ ask })
    void a.mayOpen('a1', 'https://example.com/')
    void a.mayOpen('a2', 'https://example.com/')
    void a.mayOpen('a1', 'https://other.org/')
    expect(ask).toHaveBeenCalledTimes(3)
  })

  it('treats the same host on another port as another site', async () => {
    const a = createAccess({ ask })
    a.setAllowed(['example.com'])
    void a.mayOpen('a1', 'https://example.com:8443/')
    expect(ask).toHaveBeenCalledTimes(1)
  })
})
