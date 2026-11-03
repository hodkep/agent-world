import type { VoiceCheck } from '../../shared/types'

export const DEFAULT_LIVE_MODEL = 'gemini-3.8-live'

/** Models that take part in a talk. Transcription, translation and robotics models also speak the Live protocol but are not for this. */
const NOT_FOR_TALKING = /transcribe|translate|robotics/

/** Asks Google which voice (Live) models the key can use, which also tells whether the key works. The key travels in a header, never the address. */
export async function checkKey(key: string, fetchFn: typeof fetch = fetch): Promise<VoiceCheck> {
  const k = key.trim()
  if (!k || k.length > 200) return { ok: false, reason: 'invalid' }
  let res: Response
  try {
    res = await fetchFn('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', { headers: { 'x-goog-api-key': k }, signal: AbortSignal.timeout(15_000) })
  } catch {
    return { ok: false, reason: 'unreachable' }
  }
  if (res.status === 400 || res.status === 401 || res.status === 403) return { ok: false, reason: 'invalid' }
  if (!res.ok) return { ok: false, reason: 'unreachable' }
  const body = (await res.json().catch(() => ({}))) as { models?: { name?: string; supportedGenerationMethods?: string[] }[] }
  const names = (body.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes('bidiGenerateContent') && typeof m.name === 'string')
    .map((m) => m.name!.replace(/^models\//, ''))
    .filter((n) => !NOT_FOR_TALKING.test(n))
  if (!names.length) return { ok: false, reason: 'none' }
  // The default first, then the newest names; a retired model simply drops out of the list.
  const models = [...names].sort((a, b) => (a === DEFAULT_LIVE_MODEL ? -1 : b === DEFAULT_LIVE_MODEL ? 1 : b.localeCompare(a)))
  return { ok: true, models }
}
