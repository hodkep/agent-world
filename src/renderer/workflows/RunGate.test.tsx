// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Run, RunStep } from '../../shared/runs'

// The card reads the step's brief as Markdown; the chat's renderer needs a real browser and none of it is under test here.
vi.mock('../chat/markdown', () => ({ Markdown: ({ text }: { text: string }) => <span>{text}</span> }))

import { RunGate } from './RunGate'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const run = { id: 'r1', agent: 'a1', title: 'Task', workflow: { id: 'w', name: 'Standard', steps: [] } } as unknown as Run
const push = { id: 'push', kind: 'work', name: 'Push', start: 'run' } as RunStep
const aw = { workflows: { startStep: vi.fn(), runCheck: vi.fn(), skipCheck: vi.fn(), declineStep: vi.fn() }, finishAudit: vi.fn(), finishAside: vi.fn() }
const mount = async () => {
  const host = document.body.appendChild(document.createElement('div'))
  await act(async () => createRoot(host).render(<RunGate agentName="ada" run={run} step={push} />))
  return host
}
const named = (h: HTMLElement, text: string) => [...h.querySelectorAll('button')].find((b) => b.textContent === text)!

describe('the card that asks the person before a step starts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(window as unknown as { aw: typeof aw }).aw = aw
    aw.workflows.startStep.mockResolvedValue(undefined)
    aw.workflows.declineStep.mockResolvedValue(undefined)
  })
  afterEach(() => void (document.body.innerHTML = ''))

  it('Run starts the step', async () => {
    const host = await mount()
    await act(async () => named(host, 'Run').click())
    expect(aw.workflows.startStep).toHaveBeenCalledWith('r1', 'push', undefined)
  })

  it('Not now declines the step and starts nothing', async () => {
    const host = await mount()
    await act(async () => named(host, 'Not now').click())
    expect(aw.workflows.declineStep).toHaveBeenCalledWith('r1', 'push', undefined)
    expect(aw.workflows.startStep).not.toHaveBeenCalled()
  })
})
