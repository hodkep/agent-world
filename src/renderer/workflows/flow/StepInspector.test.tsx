// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Workflow } from '../../../shared/workflow'
import { StepInspector } from './StepInspector'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const wf = (verify: Record<string, unknown> = {}): Workflow => ({ version: 1, id: 'w', name: 'W', steps: [{ id: 'build', kind: 'work' }, { id: 'verify', kind: 'work', name: 'Verify', ...verify }] }) as Workflow

async function draw(w: Workflow, at: number) {
  const change = vi.fn()
  const host = document.body.appendChild(document.createElement('div'))
  await act(async () => createRoot(host).render(<StepInspector wf={w} at={at} skills={[]} skillStates={{}} change={change} />))
  return { host, change }
}
const press = (host: HTMLElement, label: string) => act(async () => void [...host.querySelectorAll('button')].find((b) => b.textContent?.startsWith(label))!.click())

describe('who finishes a step, in the step inspector', () => {
  afterEach(() => void (document.body.innerHTML = ''))

  it('is a switch between the agent and me on a work step, the agent by default', async () => {
    const { host } = await draw(wf(), 1)
    const sw = host.querySelector('[aria-label="Who finishes step 2"]')!
    expect([...sw.querySelectorAll('button')].map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([['The agent', 'true'], ['Me', 'false']])
    expect(host.querySelector('[aria-label="Done button of step 2"]')).toBeNull()
  })

  it('choosing me makes the step the person\'s and offers the words of its two buttons', async () => {
    const { host, change } = await draw(wf({ start: 'run' }), 1)
    await press(host, 'Me')
    expect((change.mock.calls[0]![0] as Workflow).steps[1]).toEqual({ id: 'verify', kind: 'work', name: 'Verify', by: 'person' })
    const { host: shown, change: again } = await draw(wf({ by: 'person' }), 1)
    const confirm = shown.querySelector('input[aria-label="Done button of step 2"]') as HTMLInputElement
    expect(confirm.placeholder).toBe('Approve')
    expect(shown.querySelector('input[aria-label="Send-back button of step 2"]')).not.toBeNull()
    expect(shown.querySelector('[aria-label="Settings of step 2"]')?.textContent).not.toContain('Asks me first')
    expect(again).not.toHaveBeenCalled()
  })

  it('takes the button words into the step, and the agent again takes them out', async () => {
    const w = wf({ by: 'person' })
    const { host, change } = await draw(w, 1)
    const input = host.querySelector('input[aria-label="Done button of step 2"]') as HTMLInputElement
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    await act(async () => {
      set.call(input, 'Tested, looks good')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect((change.mock.calls.at(-1)![0] as Workflow).steps[1]!.confirm).toBe('Tested, looks good')
    const { host: h2, change: c2 } = await draw(wf({ by: 'person', confirm: 'Yes', reject: 'No' }), 1)
    await press(h2, 'The agent')
    expect((c2.mock.calls[0]![0] as Workflow).steps[1]).toEqual({ id: 'verify', kind: 'work', name: 'Verify' })
  })

  it('is not offered on a step that is not work', async () => {
    const { host } = await draw({ version: 1, id: 'w', name: 'W', steps: [{ id: 'p', kind: 'plan' }] } as Workflow, 0)
    expect(host.querySelector('[aria-label="Who finishes step 1"]')).toBeNull()
  })

  it('offers only who can do the step as the app reads it, so a choice does not turn back: a work step has the agent only', async () => {
    const { host } = await draw(wf(), 1)
    expect([...host.querySelectorAll('.si-icon')].map((b) => b.getAttribute('aria-label'))).toEqual(['Agent'])
    expect(host.querySelector('input[aria-label="Command of step 2"]')).toBeNull()
  })

  it('a landing step stays the person\'s, and can be given to the agent', async () => {
    const { host } = await draw({ version: 1, id: 'w', name: 'W', steps: [{ id: 'build', kind: 'work' }, { id: 'land', kind: 'merge' }] } as Workflow, 1)
    expect([...host.querySelectorAll('.si-icon')].map((b) => b.getAttribute('aria-label'))).toEqual(['You'])
  })
})
