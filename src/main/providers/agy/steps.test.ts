import { describe, expect, it } from 'vitest'
import { decodeStep } from './steps'
import { bytes, msg, str, varint } from './wire.test-helper'

const at = (sec: number, nanos = 0) => msg(1, varint(1, sec), varint(2, nanos))

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
  it('steps of kinds it does not know add nothing, and garbage does not throw', () => {
    expect(decodeStep({ idx: 5, type: 999, status: 3, payload: Buffer.from([1, 2, 3]) })).toEqual([])
    expect(decodeStep({ idx: 6, type: 15, status: 3, payload: bytes('ffffffff') })).toEqual([])
    expect(decodeStep({ idx: 7, type: 14, status: 3, payload: null })).toEqual([])
  })
})
