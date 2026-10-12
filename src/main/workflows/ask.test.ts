import { describe, expect, it } from 'vitest'
import { askArgs, parseAsk } from './ask'

describe('reading what the headless claude printed', () => {
  it('gives the reply text, what it cost and which model answered', () => {
    const out = JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: '{"findings":[]}', total_cost_usd: 0.0007, modelUsage: { 'claude-haiku-5-5': { costUSD: 0.0007 } } })
    expect(parseAsk(out)).toEqual({ text: '{"findings":[]}', cost: 0.0007, model: 'claude-haiku-5-5' })
  })

  it('throws the CLI\'s own message when it reports an error, and when the output is not JSON at all', () => {
    expect(() => parseAsk(JSON.stringify({ type: 'result', is_error: true, result: 'Credit balance is too low' }))).toThrow('Credit balance is too low')
    expect(() => parseAsk('Segmentation fault')).toThrow('claude printed something unreadable')
  })
})

describe('the arguments of an audit call', () => {
  it('uses no tools, skills, MCP servers, saved session or settings, so the call is only the question and costs little', () => {
    expect(askArgs('haiku')).toEqual(['-p', '--model', 'haiku', '--output-format', 'json', '--tools', '', '--disable-slash-commands', '--no-session-persistence', '--strict-mcp-config', '--setting-sources', ''])
  })
})
