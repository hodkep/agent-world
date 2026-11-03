import { describe, expect, it } from 'vitest'
import type { ChatItem } from '../../shared/chat'
import { lastReply, recentChat } from './agentChat'

let n = 0
const at = () => ++n
const user = (text: string): ChatItem => ({ kind: 'user', id: `u${n}`, at: at(), text })
const said = (text: string): ChatItem => ({ kind: 'assistant', id: `a${n}`, at: at(), text })
const tool = (name: string, input: Record<string, unknown>): ChatItem => ({ kind: 'tool', id: `t${n}`, at: at(), toolUseId: `x${n}`, name, input })
const thinking = (): ChatItem => ({ kind: 'thinking', id: `k${n}`, at: at() })
const result = (text: string): ChatItem => ({ kind: 'tool-result', id: `r${n}`, at: at(), toolUseId: 'x', text, isError: false })

describe('what an agent has written lately', () => {
  it('tells the person\'s messages, the agent\'s replies and the tools it ran, in order, and leaves out its thinking and raw tool output', () => {
    const items = [user('add a health check'), thinking(), tool('Read', { file_path: 'src/health.ts' }), result('export const ok = false\n'.repeat(50)), said('Done. I changed health.ts.')]
    expect(recentChat(items)).toEqual([
      { who: 'person', text: 'add a health check' },
      { who: 'agent', text: 'ran Read src/health.ts' },
      { who: 'agent', text: 'Done. I changed health.ts.' }
    ])
  })
  it('keeps the latest turns when there are more than asked for', () => {
    const items = Array.from({ length: 30 }, (_, i) => said(`reply ${i}`))
    expect(recentChat(items, { count: 3 }).map((t) => t.text)).toEqual(['reply 27', 'reply 28', 'reply 29'])
  })
  it('shortens a long turn and keeps the whole within a size, dropping the oldest first', () => {
    const items = Array.from({ length: 12 }, (_, i) => said(`${i}: ${'word '.repeat(300)}`))
    const out = recentChat(items, { count: 12 })
    expect(out.every((t) => t.text.length <= 601)).toBe(true)
    expect(out.reduce((s, t) => s + t.text.length, 0)).toBeLessThanOrEqual(4000)
    expect(out.at(-1)!.text.startsWith('11:')).toBe(true)
  })
  it('keeps keys and tokens out', () => {
    const out = recentChat([said('use AIzaSyD3x4mpleK7Qx90bJm2LrTz8Vn5wHcF1aE and ghp_abcdefghijklmnopqrstuvwxyz0123456789')])
    expect(out[0]!.text).toBe('use [secret] and [secret]')
  })
  it('gives the shell command a tool ran, or its pattern, in a few words', () => {
    expect(recentChat([tool('Bash', { command: 'npm test -- --run' }), tool('Grep', { pattern: 'ok = false' })]).map((t) => t.text)).toEqual(['ran Bash npm test -- --run', 'ran Grep ok = false'])
  })
  it('has nothing for an empty conversation', () => {
    expect(recentChat([])).toEqual([])
  })
})

describe('the last thing an agent said', () => {
  it('is its latest reply, shortened', () => {
    expect(lastReply([said('first'), user('and?'), said('second reply')])).toBe('second reply')
    expect(lastReply([said('x'.repeat(900))])!.length).toBeLessThanOrEqual(401)
  })
  it('is nothing when it has not replied', () => {
    expect(lastReply([user('hello')])).toBeNull()
  })
})
