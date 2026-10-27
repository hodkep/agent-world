import { describe, expect, it } from 'vitest'
import { decodeStep, sumUsage, usageOf, usageRequests, type StepRow } from './steps'
import { bytes, msg, str, varint } from './wire.test-helper'

const at = (sec: number, nanos = 0) => msg(1, varint(1, sec), varint(2, nanos))

describe('what a model step cost in tokens', () => {
  // Fields as seen in agy 1.2 conversation files and checked against the "Thought for 12s, 3.5k tokens" lines it draws:
  // 9 = thinking tokens, 3 = all it wrote (thinking plus the reply, field 10), 2 = what it read, 5 = of that, read from cache.
  const step = (read: number, cached: number | undefined, wrote: number, thinking: number, reply: number) =>
    Buffer.concat([varint(1, 15), msg(5, msg(9, varint(2, read), varint(3, wrote), ...(cached === undefined ? [] : [varint(5, cached)]), varint(9, thinking), varint(10, reply)))])
  it('gives what was read (cache included), what was written and the thinking', () => {
    expect(usageOf(step(4519, 16515, 103, 43, 60))).toEqual({ input: 21034, output: 103, thinking: 43 })
    expect(usageOf(step(17178, undefined, 3518, 3487, 31))).toEqual({ input: 17178, output: 3518, thinking: 3487 })
  })
  it('is nothing for a step that carries no usage', () => {
    expect(usageOf(Buffer.concat([varint(1, 14)]))).toBeNull()
    expect(usageOf(null)).toBeNull()
  })
  it('adds up a conversation, and takes the last step as how much it holds now', () => {
    const sum = sumUsage([usageOf(step(1000, undefined, 100, 80, 20)), null, usageOf(step(1200, 300, 50, 10, 40))])
    expect(sum).toEqual({ input: 2500, output: 150, context: 1550 })
    expect(sumUsage([])).toBeNull()
  })
})

describe('the requests agy made, from its conversation file', () => {
  const model = (idx: number, read: number, cached: number | undefined, wrote: number, status = 3): StepRow => ({
    idx, type: 15, status,
    payload: Buffer.concat([varint(1, 15), msg(5, msg(1, varint(1, 1000 + idx), varint(2, 0)), msg(9, varint(2, read), varint(3, wrote), ...(cached === undefined ? [] : [varint(5, cached)])))])
  })
  const other = (idx: number, status = 3): StepRow => ({ idx, type: 132, status, payload: Buffer.concat([varint(1, 132)]) })

  it('gives one record per model step: read fresh, read from the cache, and written, with no figure for writing to the cache', () => {
    const { records } = usageRequests([model(1, 2362, 14927, 275), other(2), model(3, 4395, 18704, 93)], -1, 'gemini')
    expect(records).toEqual([
      { id: '1', at: 1_001_000, model: 'gemini', input: 2362, cacheRead: 14927, output: 275 },
      { id: '3', at: 1_003_000, model: 'gemini', input: 4395, cacheRead: 18704, output: 93 }
    ])
    expect('cacheWrite' in records[0]!).toBe(false)
  })

  it('counts a step with nothing from the cache as zero from the cache, because agy does report it', () => {
    expect(usageRequests([model(1, 16956, undefined, 72)], -1, 'm').records[0]).toMatchObject({ input: 16956, cacheRead: 0, output: 72 })
  })

  it('takes only the steps after the bookmark, and gives the bookmark to continue from', () => {
    const rows = [model(1, 10, 0, 1), model(3, 20, 5, 2), model(5, 30, 9, 3)]
    expect(usageRequests(rows, 3, 'm')).toMatchObject({ records: [{ id: '5' }], cursor: 5 })
    expect(usageRequests(rows, 5, 'm')).toEqual({ records: [], cursor: 5 })
  })

  it('stops at a step still being worked on, so it is read whole next time and never counted half', () => {
    const rows = [model(1, 10, 0, 1), model(3, 20, 5, 2, 1), model(5, 30, 9, 3)]
    expect(usageRequests(rows, -1, 'm')).toMatchObject({ records: [{ id: '1' }], cursor: 1 })
  })

  it('moves the bookmark past steps that carry no usage, so they are not looked at again', () => {
    expect(usageRequests([model(1, 10, 0, 1), other(2), other(3)], -1, 'm').cursor).toBe(3)
  })
})

describe('what a conversation step says', () => {
  it('a user step is what the user typed', () => {
    const payload = Buffer.concat([varint(1, 14), msg(5, at(1000, 500_000_000)), msg(19, str(2, 'fix the login bug'))])
    expect(decodeStep({ idx: 0, type: 14, status: 3, payload })).toEqual([{ kind: 'user', id: 'agy:0', at: 1_000_500, text: 'fix the login bug' }])
  })
  it('our own first message with the house rules is not shown as something the user said', () => {
    const payload = Buffer.concat([varint(1, 14), msg(19, str(2, 'House rules for this session. Keep them in mind; reply only "ok" now.\n\nSmall commits.'))])
    expect(decodeStep({ idx: 0, type: 14, status: 3, payload })).toEqual([])
  })
  it('a model step gives its thinking, its answer, and each tool it called', () => {
    const payload = Buffer.concat([
      varint(1, 15),
      msg(5, at(2000)),
      msg(20, str(1, 'Done: the file is fixed.'), str(3, 'private reasoning'), msg(7, str(1, 'call_1'), str(2, 'run_command'), str(3, '{"CommandLine":"ls","toolAction":"List files"}')))
    ])
    expect(decodeStep({ idx: 1, type: 15, status: 3, payload })).toEqual([
      { kind: 'thinking', id: 'agy:1:think', at: 2_000_000 },
      { kind: 'assistant', id: 'agy:1:say', at: 2_000_000, text: 'Done: the file is fixed.' },
      { kind: 'tool', id: 'agy:1:call_1', at: 2_000_000, toolUseId: 'call_1', name: 'Bash', input: { command: 'ls', description: 'List files' } }
    ])
  })
  it('a tool step gives its output, and says when it was refused', () => {
    const ran = Buffer.concat([varint(1, 132), msg(5, at(3000), msg(4, str(1, 'call_1'), str(2, 'run_command'))), msg(140, msg(2, str(1, 'exit 0\nfile.txt')))])
    expect(decodeStep({ idx: 2, type: 132, status: 3, payload: ran })).toEqual([{ kind: 'tool-result', id: 'agy:2', at: 3_000_000, toolUseId: 'call_1', text: 'exit 0\nfile.txt', isError: false }])
    const denied = Buffer.concat([varint(1, 132), msg(5, at(3000), msg(4, str(1, 'call_2'), str(2, 'run_command')))])
    expect(decodeStep({ idx: 3, type: 132, status: 6, payload: denied })).toEqual([{ kind: 'tool-result', id: 'agy:3', at: 3_000_000, toolUseId: 'call_2', text: 'Not run: it was cancelled or refused.', isError: true }])
  })
  it('a tool it has no name for is shown under its own name with its arguments', () => {
    const payload = Buffer.concat([varint(1, 15), msg(5, at(10)), msg(20, msg(7, str(1, 'c9'), str(2, 'mystery_tool'), str(3, '{"a":1}')))])
    expect(decodeStep({ idx: 4, type: 15, status: 3, payload })[0]).toMatchObject({ kind: 'tool', name: 'mystery_tool', input: { a: 1 } })
  })
  it('agy tools come out under the names the chat draws, so the same work looks the same for every program', () => {
    const call = (name: string, args: string) => decodeStep({ idx: 7, type: 15, status: 3, payload: Buffer.concat([varint(1, 15), msg(5, at(10)), msg(20, msg(7, str(1, 'c1'), str(2, name), str(3, args)))]) })[0]
    expect(call('view_file', '{"AbsolutePath":"/a/b.ts"}')).toMatchObject({ name: 'Read', input: { file_path: '/a/b.ts' } })
    expect(call('find_by_name', '{"Pattern":"*.ts","SearchDirectory":"/a"}')).toMatchObject({ name: 'Glob', input: { pattern: '*.ts', path: '/a' } })
    expect(call('list_dir', '{"DirectoryPath":"/a"}')).toMatchObject({ name: 'Glob', input: { pattern: '*', path: '/a' } })
    expect(call('search_web', '{"query":"weather pune"}')).toMatchObject({ name: 'WebSearch', input: { query: 'weather pune' } })
    expect(call('call_mcp_tool', '{"ServerName":"agent-world","ToolName":"list_agents","Arguments":{}}')).toMatchObject({ name: 'mcp__agent-world__list_agents', input: {} })
  })
  it('one call that starts subagents is one Agent call each, as the delegation card expects, and its own answer line adds nothing', () => {
    const args = JSON.stringify({ Subagents: [{ Model: 'flash', Prompt: 'Search the web for the weather in Pune', TypeName: 'researcher' }, { Model: 'flash', Prompt: 'Summarise', Role: 'writer' }] })
    const model = Buffer.concat([varint(1, 15), msg(5, at(10)), msg(20, msg(7, str(1, 'c1'), str(2, 'invoke_subagent'), str(3, args)))])
    expect(decodeStep({ idx: 8, type: 15, status: 3, payload: model })).toMatchObject([
      { kind: 'tool', toolUseId: 'c1:0', name: 'Agent', input: { description: 'Search the web for the weather in Pune', subagent_type: 'researcher' } },
      { kind: 'tool', toolUseId: 'c1:1', name: 'Agent', input: { description: 'writer', subagent_type: 'subagent' } }
    ])
    const made = Buffer.concat([varint(1, 132), msg(5, at(20), msg(4, str(1, 'c1'), str(2, 'invoke_subagent'))), msg(140, msg(2, str(1, 'Created the following subagents')))])
    expect(decodeStep({ idx: 9, type: 132, status: 3, payload: made })).toEqual([])
  })
  it('steps of kinds it does not know add nothing, and garbage does not throw', () => {
    expect(decodeStep({ idx: 5, type: 999, status: 3, payload: Buffer.from([1, 2, 3]) })).toEqual([])
    expect(decodeStep({ idx: 6, type: 15, status: 3, payload: bytes('ffffffff') })).toEqual([])
    expect(decodeStep({ idx: 7, type: 14, status: 3, payload: null })).toEqual([])
  })
})
