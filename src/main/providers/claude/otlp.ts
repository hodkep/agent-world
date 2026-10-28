import type { UsageRecord } from '../../../shared/tokens'
import type { Reading } from '../../../shared/readings'

type Value = { stringValue?: string; intValue?: string | number; doubleValue?: number; boolValue?: boolean }
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : [])
const obj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {})

/** A count in an event's attributes: OTLP sends integers as text or as numbers, so both are read; anything else is not a count. */
const count = (v: Value | undefined): number | undefined => {
  const n = Number(v?.intValue ?? v?.doubleValue ?? v?.stringValue)
  return v !== undefined && Number.isFinite(n) && n >= 0 ? n : undefined
}

/** The event records of a batch, each as its attributes by name. */
function* eventsOf(body: unknown): Generator<Record<string, Value>> {
  for (const rl of arr(obj(body).resourceLogs))
    for (const sl of arr(obj(rl).scopeLogs))
      for (const rec of arr(obj(sl).logRecords)) {
        const a: Record<string, Value> = {}
        for (const kv of arr(obj(rec).attributes)) a[String(obj(kv).key)] = obj(obj(kv).value) as Value
        yield a
      }
}

/**
 * The numbers a widget may be given from a batch of events: a reading per request (tokens, price, how long, how long to the first word) and per tool call
 * (its name, how long, whether it failed). Only counts, the tool's name and Claude's prompt id are taken; who the person is, what was asked and what a tool was given stay out.
 */
export function parseOtlpReadings(body: unknown): Reading[] {
  const out: Reading[] = []
  for (const a of eventsOf(body)) {
    const name = a['event.name']?.stringValue
    if (name !== 'api_request' && name !== 'tool_result') continue
    const at = Date.parse(a['event.timestamp']?.stringValue ?? '')
    const turn = a['prompt.id']?.stringValue
    const v: Record<string, number> = {}
    const put = (k: string, n: number | undefined) => void (n !== undefined && (v[k] = n))
    put('durationMs', count(a.duration_ms))
    if (name === 'api_request') {
      put('input', count(a.input_tokens))
      put('output', count(a.output_tokens))
      put('cacheRead', count(a.cache_read_tokens))
      put('cacheWrite', count(a.cache_creation_tokens))
      put('firstTokenMs', count(a.ttft_ms))
      put('costUsd', count(a.cost_usd))
    } else {
      const ok = a.success?.stringValue ?? String(a.success?.boolValue)
      if (ok !== 'true' && ok !== 'false') continue
      v.failed = ok === 'true' ? 0 : 1
    }
    const tool = a.tool_name?.stringValue
    if (name === 'tool_result' && !tool) continue
    out.push({ kind: name === 'api_request' ? 'request' : 'tool', at: Number.isFinite(at) ? at : Date.now(), ...(turn && { turn }), ...(name === 'tool_result' && { tool }), v })
  }
  return out
}

/**
 * The requests to the model in a batch of Claude Code's OpenTelemetry events (OTLP over HTTP/JSON), one record each.
 * Only the counts, the model and the request's id are taken: the events also name the person and their organization, and that stays here.
 * A request with no id (it could be counted twice) or no input and output counts (it would count as nothing) is skipped.
 */
export function parseOtlpLogs(body: unknown): UsageRecord[] {
  const out: UsageRecord[] = []
  for (const a of eventsOf(body)) {
    if (a['event.name']?.stringValue !== 'api_request') continue
    const id = a.request_id?.stringValue
    const input = count(a.input_tokens)
    const output = count(a.output_tokens)
    if (!id || input === undefined || output === undefined) continue
    const at = Date.parse(a['event.timestamp']?.stringValue ?? '')
    out.push({ id, at: Number.isFinite(at) ? at : Date.now(), model: a.model?.stringValue ?? 'unknown', input, cacheRead: count(a.cache_read_tokens), cacheWrite: count(a.cache_creation_tokens), output })
  }
  return out
}
