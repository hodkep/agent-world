import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseOtlpLogs } from './otlp'

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
