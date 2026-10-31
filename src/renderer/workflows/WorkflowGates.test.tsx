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

  it('a refused step asks what next, with the steps still to come, and sends the choice made', async () => {
    const refusedAnswer = vi.fn().mockResolvedValue(undefined)
    ;(window as unknown as { aw: unknown }).aw = { workflows: { refusedAnswer } }
    const host = document.body.appendChild(document.createElement('div'))
    await act(async () => createRoot(host).render(<WorkflowGates agentName="ada" refused={{ run, ask: { id: 'verify', name: 'Verify the changes', rest: ['Commit', 'Push'], skippable: true } }} onDecideStep={vi.fn()} onDecidePlan={vi.fn()} />))
    expect(host.textContent).toContain('Verify the changes refused')
    expect([...host.querySelectorAll('.sg-chip')].map((c) => c.textContent)).toEqual(['Commit', 'Push'])
    const press = async (label: string) => act(async () => void [...host.querySelectorAll('button')].find((b) => b.textContent === label)!.click())
    await press('Skip it and continue')
    await press('Ask again later')
    await press('Stop here')
    expect(refusedAnswer.mock.calls).toEqual([['r1', 'verify', 'skip'], ['r1', 'verify', 'later'], ['r1', 'verify', 'stop']])
  })

  it('a refused step that is not skippable offers only Ask again later and Stop here', async () => {
    const host = document.body.appendChild(document.createElement('div'))
    await act(async () => createRoot(host).render(<WorkflowGates agentName="ada" refused={{ run, ask: { id: 'build', name: 'Build', rest: ['Commit'], skippable: false } }} onDecideStep={vi.fn()} onDecidePlan={vi.fn()} />))
    expect([...host.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Ask again later', 'Stop here'])
  })

  it('a question to skip every step of a run that did nothing says no workflow was needed, and can drop the run', async () => {
    const dropRun = vi.fn().mockResolvedValue(undefined)
    const answerSkip = vi.fn().mockResolvedValue(undefined)
    ;(window as unknown as { aw: unknown }).aw = { workflows: { dropRun, answerSkip } }
    const idle = { id: 'r2', agent: 'a1', title: 'Check README', status: 'open', rounds: [{ n: 1, commits: [], steps: [], checks: [] }], skipAsk: { steps: ['build', 'commit'], why: 'Read only.', t: 1 }, workflow: { id: 'w', name: 'Standard', steps: [{ id: 'plan', kind: 'plan', name: 'Plan' }, { id: 'designs', kind: 'work', name: 'Designs', optional: true }, { id: 'build', kind: 'work', name: 'Build' }, { id: 'commit', kind: 'work', name: 'Commit' }] } } as unknown as Run
    const host = document.body.appendChild(document.createElement('div'))
    await act(async () => createRoot(host).render(<WorkflowGates agentName="ada" skip={idle} onDecideStep={vi.fn()} onDecidePlan={vi.fn()} />))
    expect(host.textContent).toContain('No workflow needed')
    const press = async (label: string) => act(async () => void [...host.querySelectorAll('button')].find((b) => b.textContent === label)!.click())
    await press('Drop this run')
    await press('Keep it and skip the steps')
    expect(dropRun).toHaveBeenCalledWith('r2')
    expect(answerSkip).toHaveBeenCalledWith('r2', true)
    // A run with work recorded keeps the plain question.
    const worked = { ...idle, rounds: [{ n: 1, commits: [], steps: [{ step: 'build', state: 'done' }], checks: [] }] } as unknown as Run
    await act(async () => createRoot(host).render(<WorkflowGates agentName="ada" skip={worked} onDecideStep={vi.fn()} onDecidePlan={vi.fn()} />))
    expect(host.textContent).not.toContain('No workflow needed')
  })
})
