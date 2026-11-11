// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { parseWorkflowMessage } from '../../shared/workflowMessage'
import { WorkflowReceipt } from './WorkflowReceipt'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const draw = async (text: string, local = false) => {
  const host = document.body.appendChild(document.createElement('div'))
  await act(async () => createRoot(host).render(<WorkflowReceipt msg={parseWorkflowMessage(text)!} rowId="r1" at={Date.UTC(2026, 0, 1, 10, 0)} local={local} />))
  return host
}

describe('a workflow answer in the chat', () => {
  it('is one line with the step, and the sentence the agent got is folded under it, with no Copy or Rewind', async () => {
    const host = await draw('[Agent World] The person refused your step "Pull request", so the workflow stops here: do not do it or any step after it. Say so in one line and wait for their instructions.')
    expect(host.querySelector('summary')!.textContent).toContain('Refused Pull request')
    expect(host.querySelector('.wf-tile.no')).not.toBeNull()
    expect(host.querySelector('.wf-told')!.textContent).toContain('The person refused your step "Pull request"')
    expect(host.querySelector('details')!.hasAttribute('open')).toBe(false)
    expect(host.textContent).not.toContain('Rewind')
    expect(host.textContent).not.toContain('Copy')
  })

  it('says so when it was never typed to the agent, because nothing was left of the workflow', async () => {
    const host = await draw('[Agent World] Your steps "Commit", "Push" and "Pull request" were skipped by the person. Go on with the next step.', true)
    expect(host.querySelector('summary')!.textContent).toContain('Skipped Commit, Push and Pull request')
    expect(host.querySelector('.wf-told')!.textContent).toContain('Not told to the agent')
    expect(host.querySelector('.wf-told')!.textContent).not.toContain('Go on with the next step')
  })
  it('shows a step marked done by hand as two rows, the step marked and the step that starts', async () => {
    const host = await draw('[Agent World] The person marked your step "UI design options" done themselves: do not report it. Next step: "Build". It is for: Build the approved plan.')
    const rows = host.querySelectorAll('summary .wf-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.textContent).toContain('UI design options')
    expect(rows[0]!.textContent).toContain('marked done by you')
    expect(host.querySelector('.wf-tile.ok')).not.toBeNull()
    expect(rows[1]!.textContent).toContain('Build')
    expect(rows[1]!.textContent).toContain('starts now')
    expect(host.querySelector('.wf-tile.go')).not.toBeNull()
    expect(host.querySelector('details')!.hasAttribute('open')).toBe(false)
    expect(host.querySelector('.wf-told')!.textContent).toContain('done themselves')
  })
  it('says that the next step waits for Run, and has a single row when there is no next step', async () => {
    const waits = await draw('[Agent World] The person marked your step "Verify" done themselves: do not report it. Next step: "Review"; it starts when the person presses Run, so change nothing until you are told.')
    expect(waits.querySelectorAll('summary .wf-row')[1]!.textContent).toContain('starts when you press Run')
    const last = await draw('[Agent World] The person marked your step "Pull request" done themselves: do not report it. That was the last step.')
    expect(last.querySelectorAll('summary .wf-row')).toHaveLength(1)
  })
})
