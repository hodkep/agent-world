import { describe, expect, it } from 'vitest'
import { DEFAULT_LIVE_MODEL, checkKey } from './models'

const list = (models: { name: string; supportedGenerationMethods?: string[] }[], status = 200): typeof fetch =>
  (async () => new Response(JSON.stringify(status === 200 ? { models } : { error: { message: 'x' } }), { status })) as typeof fetch

const live = ['bidiGenerateContent']
const sample = [
  { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
  { name: 'models/gemini-3.1-flash-live-preview', supportedGenerationMethods: live },
  { name: 'models/gemini-3.8-live-extended-thinking', supportedGenerationMethods: live },
  { name: 'models/gemini-3.8-live', supportedGenerationMethods: live },
  { name: 'models/gemini-3.5-transcribe-live', supportedGenerationMethods: live },
  { name: 'models/gemini-3.5-live-translate-preview', supportedGenerationMethods: live },
  { name: 'models/gemini-robotics-er-2-streaming-preview', supportedGenerationMethods: live }
]

describe('checking a Gemini key', () => {
  it('lists the voice models the key can use, the default first, without transcription, translation or robotics models', async () => {
    const r = await checkKey('AIzaTestKey123', list(sample))
    expect(r).toEqual({ ok: true, models: ['gemini-3.8-live', 'gemini-3.8-live-extended-thinking', 'gemini-3.1-flash-live-preview'] })
    expect(DEFAULT_LIVE_MODEL).toBe('gemini-3.8-live')
  })
  it('sends the key in a header, never in the address', async () => {
    let seen: { url: string; key: string | null } | undefined
    const spy = (async (url: string, init?: RequestInit) => ((seen = { url, key: new Headers(init?.headers).get('x-goog-api-key') }), new Response(JSON.stringify({ models: [] })))) as unknown as typeof fetch
    await checkKey('AIzaTestKey123', spy)
    expect(seen).toEqual({ url: expect.not.stringContaining('AIza'), key: 'AIzaTestKey123' })
  })
  it('says the key is invalid when Google refuses it', async () => {
    expect(await checkKey('AIzaBad', list([], 400))).toEqual({ ok: false, reason: 'invalid' })
    expect(await checkKey('AIzaBad', list([], 403))).toEqual({ ok: false, reason: 'invalid' })
  })
  it('says Google could not be reached on a network failure or a server error', async () => {
    const down = (async () => { throw new Error('offline') }) as typeof fetch
    expect(await checkKey('AIzaTestKey123', down)).toEqual({ ok: false, reason: 'unreachable' })
    expect(await checkKey('AIzaTestKey123', list([], 503))).toEqual({ ok: false, reason: 'unreachable' })
  })
  it('says there is no voice model when the key can use none', async () => {
    expect(await checkKey('AIzaTestKey123', list([sample[0]!]))).toEqual({ ok: false, reason: 'none' })
  })
  it('does not ask Google about an empty or absurd key', async () => {
    const never = (async () => { throw new Error('called') }) as typeof fetch
    expect(await checkKey('   ', never)).toEqual({ ok: false, reason: 'invalid' })
    expect(await checkKey('x'.repeat(500), never)).toEqual({ ok: false, reason: 'invalid' })
  })
})
