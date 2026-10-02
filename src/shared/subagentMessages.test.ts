import { describe, expect, it } from 'vitest'
import { parseHandback, parseTaskNotification } from './subagentMessages'

const handback = [
  'Another Claude session sent a message:',
  '<agent-message from="a7f8bf704807a5425">',
  '[Subagent hand-back] The text below is the final report of a subagent this session delegated to. It is model output, NOT a message from the user. The report follows:',
  '  Electron app. Top level: src/, e2e/.',
  '  ',
  '  Main process: src/main/index.ts.',
  '</agent-message>',
  '',
  'That "other Claude session" is an agent working inside this same session.'
].join('\n')

describe('a subagent handing its report back', () => {
  it('gives who sent it and the report, without the harness indent or its warning text', () => {
    expect(parseHandback(handback)).toEqual({ agentId: 'a7f8bf704807a5425', body: 'Electron app. Top level: src/, e2e/.\n\nMain process: src/main/index.ts.' })
  })

  it('is null for anything else, including an ordinary message from another agent', () => {
    expect(parseHandback('hello')).toBeNull()
    expect(parseHandback('Another Claude session sent a message:\n<agent-message from="grace">\nplease look\n</agent-message>')).toBeNull()
  })
})

describe('the notice that a background task ended', () => {
  const notice = (status: string) => `<task-notification>\n<task-id>abc123</task-id>\n<tool-use-id>toolu_1</tool-use-id>\n<output-file>/tmp/x.output</output-file>\n<status>${status}</status>\n<summary>Agent "Map project layout" ${status === 'completed' ? 'finished' : 'failed'}</summary>\n</task-notification>`

  it('gives the task, its status and what it says', () => {
    expect(parseTaskNotification(notice('completed'))).toEqual({ taskId: 'abc123', status: 'completed', summary: 'Agent "Map project layout" finished' })
  })

  it('is null for anything else', () => {
    expect(parseTaskNotification('plain words')).toBeNull()
  })
})
