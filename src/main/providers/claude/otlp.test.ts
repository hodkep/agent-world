import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseOtlpLogs, parseOtlpReadings } from './otlp'

// Taken from a real Claude Code 2.1.311 run exporting its events as OTLP over HTTP/JSON, with the personal attributes replaced.
const sample = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'otlp-logs.json'), 'utf8'))

describe('Claude Code OpenTelemetry events', () => {
  it('give one record per request to the model, with what it read fresh, from the cache, wrote to it and wrote back', () => {
    const recs = parseOtlpLogs(sample)
    expect(recs).toHaveLength(3)
    expect(recs[0]).toEqual({ id: 'req_011CgSdYGsyudaJggoqaVgi4', at: Date.parse('2026-10-27T11:03:55.721Z'), model: 'claude-sonnet-5-5', input: 2, cacheRead: 11990, cacheWrite: 5616, output: 160 })
    expect(recs.reduce((n, r) => n + r.output, 0)).toBe(636)
    expect(recs.reduce((n, r) => n + (r.cacheRead ?? 0), 0)).toBe(52799)
  })

  it('carry nothing about who the person is', () => {
    expect(Object.keys(parseOtlpLogs(sample)[0]!).sort()).toEqual(['at', 'cacheRead', 'cacheWrite', 'id', 'input', 'model', 'output'])
    expect(JSON.stringify(parseOtlpLogs(sample))).not.toMatch(/example\.com|org-0000|acct-0000/)
  })

  it('leave out the other events (a prompt, a tool call): they are not requests', () => {
    const kinds = sample.resourceLogs[0].scopeLogs[0].logRecords.map((r: { attributes: { key: string; value: { stringValue?: string } }[] }) => r.attributes.find((a) => a.key === 'event.name')?.value.stringValue)
    expect(kinds).toContain('user_prompt')
    expect(parseOtlpLogs(sample).length).toBe(kinds.filter((k: string) => k === 'api_request').length)
  })

  it('read a count sent as text as well as one sent as a number', () => {
    const body = { resourceLogs: [{ scopeLogs: [{ logRecords: [{ attributes: [
      { key: 'event.name', value: { stringValue: 'api_request' } }, { key: 'request_id', value: { stringValue: 'r1' } }, { key: 'model', value: { stringValue: 'm' } },
      { key: 'event.timestamp', value: { stringValue: '2026-10-27T11:03:55.721Z' } },
      { key: 'input_tokens', value: { stringValue: '5' } }, { key: 'output_tokens', value: { intValue: '7' } }, { key: 'cache_read_tokens', value: { intValue: 9 } }, { key: 'cache_creation_tokens', value: { intValue: 0 } }
    ] }] }] }] }
    expect(parseOtlpLogs(body)[0]).toMatchObject({ input: 5, output: 7, cacheRead: 9, cacheWrite: 0 })
  })

  it('give nothing, and do not throw, for what is not a batch of events', () => {
    for (const bad of [null, undefined, 'x', [], {}, { resourceLogs: 3 }, { resourceLogs: [{ scopeLogs: [{ logRecords: [{ attributes: 'no' }] }] }] }]) expect(parseOtlpLogs(bad)).toEqual([])
  })

  it('skip a request that names no id or tells no counts, so nothing is counted twice or as zero by mistake', () => {
    const rec = (attrs: Record<string, unknown>) => ({ resourceLogs: [{ scopeLogs: [{ logRecords: [{ attributes: Object.entries({ 'event.name': 'api_request', model: 'm', 'event.timestamp': '2026-10-27T11:03:55.721Z', ...attrs }).map(([key, v]) => ({ key, value: typeof v === 'number' ? { intValue: v } : { stringValue: v } })) }] }] }] })
    expect(parseOtlpLogs(rec({ input_tokens: 1, output_tokens: 1 }))).toEqual([])
    expect(parseOtlpLogs(rec({ request_id: 'r', model: 'm' }))).toEqual([])
  })
})

// A real run (Claude Code, 2026-10-28) that ran one command that worked and one that failed, with the personal attributes taken out.
describe('Claude Code OpenTelemetry events, as readings for widgets', () => {
  const tools = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'otlp-tools.json'), 'utf8'))

  it('give a reading per request, with how long it took and how long until the first word', () => {
    const rs = parseOtlpReadings(tools).filter((r) => r.kind === 'request')
    expect(rs).toHaveLength(2)
    expect(rs[0]!.v).toMatchObject({ input: 2, output: 317, cacheRead: 11990, cacheWrite: 25200, durationMs: 2219, firstTokenMs: 1113 })
    expect(rs[0]!.v.costUsd).toBeCloseTo(0.0053186)
    expect(rs[0]!.turn).toBeTruthy()
  })

  it('give a reading per tool call: its name, how long it took and whether it failed', () => {
    const rs = parseOtlpReadings(tools).filter((r) => r.kind === 'tool')
    expect(rs.map((r) => [r.tool, r.v.failed])).toEqual([['Bash', 0], ['Bash', 1]])
    expect(rs[0]!.v.durationMs).toBe(745)
  })

  it('keep a number Claude left out absent, not zero', () => {
    const rs = parseOtlpReadings(sample)
    expect(rs.every((r) => !('firstTokenMs' in r.v))).toBe(true)
  })

  it('carry only numbers, a tool name and an opaque prompt id: nothing of the person, the prompt or a tool input', () => {
    const text = JSON.stringify(parseOtlpReadings(tools))
    expect(text).not.toMatch(/example\.com|@|REDACTED|echo|nonexistent|prompt_text/)
    for (const r of parseOtlpReadings(tools)) expect(Object.keys(r).sort()).toEqual(expect.arrayContaining(['at', 'kind', 'v']))
  })

  it('give nothing, and do not throw, for what is not a batch of events', () => {
    for (const bad of [null, 'x', [], {}, { resourceLogs: [{ scopeLogs: [{ logRecords: [{ attributes: 'no' }] }] }] }]) expect(parseOtlpReadings(bad)).toEqual([])
  })
})
