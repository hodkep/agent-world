// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { type RunEvent, type RunWorkflow, reduceRuns } from '../../shared/runs'
import type { Track } from '../../shared/runTrack'

vi.mock('../pixel/Pixels', () => ({ Sprite: () => null }))

import { RunBar } from './RunBar'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const FLOW: RunWorkflow = { id: 's', name: 'Standard', steps: [{ id: 'plan', kind: 'plan', name: 'Plan', gate: 'auto' }, { id: 'verify', kind: 'work', name: 'Verify', optional: true }, { id: 'commit', kind: 'work', name: 'Commit', start: 'run' }] }
const begin: RunEvent = { k: 'begin', t: 100, run: 'r1', agent: 'a1', name: 'ada', project: '/p', title: 'Task', workflow: FLOW }
const track = (now: string): Track => ({ run: 'r1', title: 'Task', workflow: 'Standard', round: 1, at: 1, stations: [{ id: now, name: now === 'verify' ? 'Verify' : 'Commit', kind: 'work', state: 'now' }] }) as unknown as Track
const ctx = { auditOn: false }

async function draw(events: RunEvent[], now: string) {
  const host = document.body.appendChild(document.createElement('div'))
  await act(async () => createRoot(host).render(<RunBar run={reduceRuns(events)[0]!} ctx={ctx} track={track(now)} seed="a1" agentName="ada" />))
  return host
}
const click = (el: Element | null | undefined) => act(async () => void (el as HTMLElement).click())
// The square of the step the run stands on.
const stepButton = (host: Element) => host.querySelector('button.sq')
const button = (host: Element, name: string) => [...host.querySelectorAll('button')].find((b) => b.textContent === name)

describe('clicking the step the run bar stands on', () => {
  afterEach(() => void (document.body.innerHTML = ''))

  it('offers Mark done, Skip and End run for the agent\'s step still under way, and Mark done closes it', async () => {
    const closeStep = vi.fn().mockResolvedValue(undefined)
    ;(window as unknown as { aw: unknown }).aw = { workflows: { closeStep, skipStep: vi.fn(), endRun: vi.fn() } }
    const host = await draw([begin], 'verify')
    await click(stepButton(host))
    // The step's square is picked out while its card is open.
    expect(host.querySelector('.st.picked')).toBeTruthy()
    expect(host.querySelector('[aria-label="Verify: what you can do"]')?.textContent).toContain("ada has not reported this step")
    expect(button(host, 'Skip')).toBeTruthy()
    await click(button(host, 'Mark done'))
    expect(closeStep).toHaveBeenCalledWith('r1', 'verify')
  })

  it('offers Run for a step that waits for it, and End run asks once before it ends the run', async () => {
    const startStep = vi.fn().mockResolvedValue(undefined)
    const endRun = vi.fn().mockResolvedValue(undefined)
    ;(window as unknown as { aw: unknown }).aw = { workflows: { startStep, endRun } }
    const host = await draw([begin, { k: 'step', t: 200, run: 'r1', round: 1, step: 'verify', state: 'done' }], 'commit')
    await click(stepButton(host))
    expect(button(host, 'Mark done')).toBeUndefined()
    await click(button(host, 'Run'))
    expect(startStep).toHaveBeenCalledWith('r1', 'commit')
    await click(stepButton(host))
    await click(button(host, 'End run…'))
    expect(host.querySelector('[aria-label="End this run"]')?.textContent).toContain('Commit')
    await click(button(host, 'End run'))
    expect(endRun).toHaveBeenCalledWith('r1')
  })
})

describe('a card already in the chat', () => {
  afterEach(() => void (document.body.innerHTML = ''))
  it('is brought into view and opened instead of a second card under the bar', async () => {
    ;(window as unknown as { aw: unknown }).aw = { workflows: {} }
    const host = await draw([begin], 'verify')
    host.appendChild(document.createElement('div')).setAttribute('role', 'log')
    const card = host.appendChild(document.createElement('section'))
    card.className = 'plan-gate'
    const unfold = card.appendChild(document.createElement('button'))
    unfold.setAttribute('aria-label', 'Open the card')
    const opened = vi.fn()
    unfold.addEventListener('click', opened)
    card.scrollIntoView = vi.fn()
    await click(stepButton(host))
    expect(opened).toHaveBeenCalled()
    expect(card.scrollIntoView).toHaveBeenCalled()
    expect(host.querySelector('.rbar-card')).toBeNull()
  })
})

describe('the step under way whose brief asks for my approval', () => {
  afterEach(() => void (document.body.innerHTML = ''))
  it('says it never asks me, beside Mark done', async () => {
    ;(window as unknown as { aw: unknown }).aw = { workflows: {} }
    const flow: RunWorkflow = { ...FLOW, steps: FLOW.steps.map((x) => (x.id === 'verify' ? { ...x, brief: 'The person tries it. Approve moves on.' } : x)) }
    const host = document.body.appendChild(document.createElement('div'))
    await act(async () => createRoot(host).render(<RunBar run={reduceRuns([{ ...begin, workflow: flow } as RunEvent])[0]!} ctx={ctx} track={track('verify')} seed="a1" agentName="ada" />))
    await click(stepButton(host))
    expect(host.querySelector('.rbar-card')?.textContent).toContain('Its brief asks for your approval, but the step never asks you')
    expect(button(host, 'Mark done')).toBeTruthy()
    // Said once, above the buttons, and not again in the End run question.
    expect(host.querySelectorAll('.rbar-warn')).toHaveLength(1)
    await click(button(host, 'End run…'))
    expect(host.querySelectorAll('.rbar-warn')).toHaveLength(0)
  })
})
