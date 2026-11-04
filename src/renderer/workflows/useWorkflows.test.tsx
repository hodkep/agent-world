// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useWorkflows } from './useWorkflows'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('the recorded runs the app keeps', () => {
  afterEach(() => void (document.body.innerHTML = ''))

  it('asks again with what it has, and does not change (or redraw the app) when nothing has', async () => {
    const full = { version: 'v1', runs: [], open: 0, spend: {}, unapproved: [] as string[] }
    const calls: (string | undefined)[] = []
    let answer: typeof full | null = full
    let fire = () => undefined as void
    ;(window as unknown as { aw: unknown }).aw = {
      workflows: { summary: vi.fn(async (since?: string) => (calls.push(since), answer)) },
      onWorkflows: (cb: () => void) => ((fire = cb), () => undefined)
    }
    const seen: unknown[] = []
    function Probe() {
      seen.push(useWorkflows())
      return null
    }
    const host = document.body.appendChild(document.createElement('div'))
    await act(async () => createRoot(host).render(<Probe />))
    const first = seen.at(-1)
    const renders = seen.length
    // An event says something changed; the main process says it did not: the state is the same object and nothing is drawn again.
    answer = null
    await act(async () => fire())
    expect(calls).toEqual([undefined, 'v1'])
    expect(seen.at(-1)).toBe(first)
    expect(seen.length).toBe(renders)
    // It did change: the new summary is taken.
    answer = { ...full, version: 'v2', open: 1 }
    await act(async () => fire())
    expect(calls.at(-1)).toBe('v1')
    expect((seen.at(-1) as typeof full).open).toBe(1)
  })
})
