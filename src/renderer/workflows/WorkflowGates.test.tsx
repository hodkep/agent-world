// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Run, RunStep } from '../../shared/runs'

// The cards read what the agent wrote as Markdown; the chat's renderer needs a real browser and none of it is under test here.
vi.mock('../chat/markdown', () => ({ Markdown: ({ text }: { text: string }) => <span>{text}</span> }))

import { WorkflowGates } from './WorkflowGates'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const run = { id: 'r1', agent: 'a1', title: 'Task', workflow: { id: 'w', name: 'Standard', steps: [] } } as unknown as Run
const commit = { id: 'commit', kind: 'work', name: 'Commit', start: 'run' } as RunStep

describe('the workflow cards in an agent\'s chat', () => {
  afterEach(() => void (document.body.innerHTML = ''))

  it('stay one card each however often the chat is drawn again, even for the same step in a Run card and an Approval card', async () => {
    const host = document.body.appendChild(document.createElement('div'))
    const root = createRoot(host)
    const draw = () => root.render(<WorkflowGates agentName="ada" runStep={{ run, step: commit }} step={{ run, step: commit }} onDecideStep={vi.fn()} onDecidePlan={vi.fn()} />)
    await act(async () => draw())
    expect(host.querySelectorAll('section')).toHaveLength(2)
    for (let i = 0; i < 6; i++) await act(async () => draw())
    expect([...host.querySelectorAll('section')].map((s) => s.getAttribute('aria-label'))).toEqual(['Run Commit for ada', 'Step from ada'])
  })

  it('show nothing for what is not waiting', async () => {
    const host = document.body.appendChild(document.createElement('div'))
    await act(async () => createRoot(host).render(<WorkflowGates agentName="ada" onDecideStep={vi.fn()} onDecidePlan={vi.fn()} />))
    expect(host.querySelectorAll('section')).toHaveLength(0)
  })
})
