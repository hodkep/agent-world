import { describe, expect, it } from 'vitest'
import { agyAskArgs, agyPrompt, askArgs, parseAgyAsk, parseAsk, retryOnce } from './ask'

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

describe('reading what the headless agy printed', () => {
  const printed = (o: object) => JSON.stringify({ conversation_id: 'c1', status: 'SUCCESS', response: '```json\n{"gaps":[]}\n```\n', duration_seconds: 10, num_turns: 1, usage: { input_tokens: 16938, output_tokens: 10, total_tokens: 16948 }, ...o })

  it('gives the reply text and the tokens it used, which is all agy reports of its cost', () => {
    expect(parseAgyAsk(printed({}), 'gemini-3.8-flash-low')).toEqual({ text: '```json\n{"gaps":[]}\n```\n', tokens: 16948, model: 'gemini-3.8-flash-low' })
  })

  it('says why when agy produced no answer: a tool wanted a permission headless mode cannot give, or the call failed', () => {
    expect(() => parseAgyAsk(printed({ response: '', denied_actions: [{ action: 'command', display_name: 'RunCommand' }] }), 'm')).toThrow('agy needed a permission (RunCommand) that a background call cannot ask for')
    expect(() => parseAgyAsk(printed({ response: '' }), 'm')).toThrow('agy gave no answer')
    expect(() => parseAgyAsk(printed({ status: 'ERROR', response: 'Quota exhausted' }), 'm')).toThrow('Quota exhausted')
  })

  it('throws plainly when the output is not JSON, and takes the JSON that follows a line agy printed first', () => {
    expect(() => parseAgyAsk('Segmentation fault', 'm')).toThrow('agy printed something unreadable')
    const noisy = `jetski: warming up\n${printed({})}`
    expect(parseAgyAsk(noisy, 'm').tokens).toBe(16948)
  })
})

describe('the arguments of an audit call on agy', () => {
  it('puts the prompt right after -p (agy reads no prompt from stdin), asks for JSON, a read-only mode and no slash commands', () => {
    expect(agyAskArgs('gemini-3.8-flash-low', 'Review this.')).toEqual(['-p', 'Review this.', '--model', 'gemini-3.8-flash-low', '--output-format', 'json', '--mode', 'plan', '--disable-slash-commands', '--print-timeout', '120s'])
  })
})

describe('what agy is told besides the question', () => {
  it('says to answer from the text alone and use no tool, since a background call cannot ask for the permission a tool needs', () => {
    const p = agyPrompt('Review this diff.')
    expect(p.startsWith('Answer from the text below only.')).toBe(true)
    expect(p).toContain('Do not run commands, open files or use any tool')
    expect(p.endsWith('Review this diff.')).toBe(true)
  })
})

describe('asking again once when agy wanted a permission', () => {
  it('tries a second time after that error and gives the second answer, and does not retry any other error or a success', async () => {
    let n = 0
    const flaky = async () => (++n === 1 ? Promise.reject(new Error('agy needed a permission (RunCommand) that a background call cannot ask for.')) : 'ok')
    expect(await retryOnce(flaky)).toBe('ok')
    expect(n).toBe(2)
    let m = 0
    await expect(retryOnce(async () => (++m, Promise.reject(new Error('Quota exhausted'))))).rejects.toThrow('Quota exhausted')
    expect(m).toBe(1)
    let k = 0
    expect(await retryOnce(async () => (++k, 'fine'))).toBe('fine')
    expect(k).toBe(1)
  })

  it('gives the error of the second try when both ask for a permission', async () => {
    let n = 0
    await expect(retryOnce(async () => Promise.reject(new Error(`agy needed a permission (Try ${++n}) that a background call cannot ask for.`)))).rejects.toThrow('Try 2')
  })
})
