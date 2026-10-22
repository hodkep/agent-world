import { describe, expect, it } from 'vitest'
import { fromAgentProgram, parseLsof, parseSs } from './peerPid'

describe('parseLsof: the processes at the two ends of a local connection', () => {
  it('lists the pids of `lsof -Fp` output, once each', () => {
    expect(parseLsof('p4100\nf13\np4200\nf23\np4200\nf9\n')).toEqual([4100, 4200])
    expect(parseLsof('')).toEqual([])
    expect(parseLsof('not lsof output')).toEqual([])
  })
})

describe('parseSs: `ss -tnp` for the same connection, on Linux', () => {
  it('reads the process that owns the end bound to the client port, and not the server end', () => {
    const out = [
      'ESTAB 0 0 127.0.0.1:57438 127.0.0.1:48555 users:(("claude",pid=42956,fd=23))',
      'ESTAB 0 0 127.0.0.1:48555 127.0.0.1:57438 users:(("electron",pid=42952,fd=31))'
    ].join('\n')
    expect(parseSs(out, 57438)).toEqual([42956])
    expect(parseSs('', 57438)).toEqual([])
  })
})

describe('fromAgentProgram: the call is the program\'s own, not a command it ran', () => {
  const app = 100
  it('is true only when every process on the connection, besides the app, is the agent\'s program', () => {
    expect(fromAgentProgram([app, 4200], 4200, app)).toBe(true)
    expect(fromAgentProgram([4200], 4200, app)).toBe(true)
  })
  it('is false for a child of the program, another process, an unknown peer or no program', () => {
    expect(fromAgentProgram([app, 4300], 4200, app)).toBe(false)
    expect(fromAgentProgram([app, 4200, 4300], 4200, app)).toBe(false)
    expect(fromAgentProgram([app], 4200, app)).toBe(false)
    expect(fromAgentProgram([], 4200, app)).toBe(false)
    expect(fromAgentProgram([app, 4200], undefined, app)).toBe(false)
  })
})
