// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { parseWorkflowMessage } from '../../shared/workflowMessage'
import { WorkflowReceipt } from './WorkflowReceipt'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const draw = async (text: string) => {
  const host = document.body.appendChild(document.createElement('div'))
  await act(async () => createRoot(host).render(<WorkflowReceipt msg={parseWorkflowMessage(text)!} rowId="r1" at={Date.UTC(2026, 0, 1, 10, 0)} />))
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
})
