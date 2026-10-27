import type { UsageRecord } from '../../../shared/tokens'

type Value = { stringValue?: string; intValue?: string | number; doubleValue?: number }
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : [])
const obj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {})

/** A count in an event's attributes: OTLP sends integers as text or as numbers, so both are read; anything else is not a count. */
const count = (v: Value | undefined): number | undefined => {
  const n = Number(v?.intValue ?? v?.doubleValue ?? v?.stringValue)
  return v !== undefined && Number.isFinite(n) && n >= 0 ? n : undefined
}

/**
 * The requests to the model in a batch of Claude Code's OpenTelemetry events (OTLP over HTTP/JSON), one record each.
 * Only the counts, the model and the request's id are taken: the events also name the person and their organization, and that stays here.
 * A request with no id (it could be counted twice) or no input and output counts (it would count as nothing) is skipped.
 */
export function parseOtlpLogs(body: unknown): UsageRecord[] {
  const out: UsageRecord[] = []
  for (const rl of arr(obj(body).resourceLogs))
    for (const sl of arr(obj(rl).scopeLogs))
      for (const rec of arr(obj(sl).logRecords)) {
        const a: Record<string, Value> = {}
        for (const kv of arr(obj(rec).attributes)) a[String(obj(kv).key)] = obj(obj(kv).value) as Value
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
