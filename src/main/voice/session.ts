import type { VoiceOut } from '../../shared/voiceEvent'
import { stepVoice, type VoiceEv, type VoiceState } from '../../shared/voiceState'

export interface LiveCallbacks {
  onmessage(m: any): void
  onclose(e: { reason?: string }): void
  onerror(e: { message?: string }): void
}
/** The part of a Gemini Live connection the session uses (the SDK's session fits it). */
export interface LiveConn {
  sendRealtimeInput(a: unknown): void
  sendClientContent(a: unknown): void
  sendToolResponse(a: unknown): void
  close(): void
}
export type { VoiceOut }

export interface SessionDeps {
  connect(o: { model: string; config: Record<string, unknown>; callbacks: LiveCallbacks }): Promise<LiveConn>
  model: string
  voice: string
  instructions: string
  tools: unknown[]
  runTool(name: string, args: Record<string, unknown>): Promise<unknown>
  emit(e: VoiceOut): void
  sleep?(ms: number): Promise<void>
  now?(): number
  /** A session was started clean after the earlier one could not be picked up: what it had been told is gone and is to be told again. */
  onFresh?(): void
}

/** Sessions that end within this long of opening count as failures; one that lived longer earns a clean slate. */
const LIVED = 15_000
const MAX_FAILURES = 4

/**
 * One talk with Gemini Live: it connects, relays speech both ways, answers the model's tool calls, passes on what each side said,
 * and keeps the talk going when the connection ends. Gemini ends a connection after about ten minutes: it says so shortly before (goAway),
 * and the session then moves to a new connection with its handle before the old one is cut. When a connection ends unannounced it is picked
 * up again with the handle, or, when Gemini no longer knows the handle, started clean; a session that keeps ending at once is given up on.
 */
export function createVoiceSession(d: SessionDeps) {
  const sleep = d.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const now = d.now ?? Date.now
  let state: VoiceState = 'idle'
  let muted = false
  let ended = false
  let conn: LiveConn | null = null
  let handle = ''
  let seq = 0
  // The connection whose words and endings count: a connection being replaced is deaf to everything it still says.
  let current = 0
  let openedAt = 0
  let failures = 0

  const emitState = () => d.emit({ type: 'state', state, muted })
  const ev = (e: VoiceEv) => {
    const next = stepVoice(state, e)
    if (next !== state) ((state = next), emitState())
  }
  const fail = (text: string) => {
    ev('fail')
    d.emit({ type: 'error', text })
  }

  const config = () => ({
    responseModalities: ['AUDIO'],
    systemInstruction: d.instructions,
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: d.voice } } },
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    tools: d.tools,
    // So a long talk is not cut off at the context limit, and a dropped connection can be picked up again.
    contextWindowCompression: { slidingWindow: {} },
    sessionResumption: handle ? { handle } : {}
  })

  /** Opens a connection. A replacement (takeover false) only becomes the current one once it is up, so the old one keeps the talk until then. */
  async function open(takeover = true) {
    const my = ++seq
    if (takeover) current = my
    const c = await d.connect({
      model: d.model,
      config: config(),
      callbacks: {
        onmessage: (m) => my === current && onmessage(m),
        onclose: (e) => my === current && void onclose(e),
        onerror: (e) => my === current && d.emit({ type: 'notice', text: e.message ?? 'Connection problem.' })
      }
    })
    const old = conn
    conn = c
    current = my
    openedAt = now()
    if (!takeover) old?.close()
  }

  async function onTools(calls: { id: string; name: string; args?: Record<string, unknown> }[]) {
    ev('toolCall')
    const functionResponses = await Promise.all(
      calls.map(async (c) => {
        d.emit({ type: 'tool', name: c.name })
        try {
          return { id: c.id, name: c.name, response: { output: await d.runTool(c.name, c.args ?? {}) } }
        } catch (e) {
          return { id: c.id, name: c.name, response: { error: e instanceof Error ? e.message : String(e) } }
        }
      })
    )
    conn?.sendToolResponse({ functionResponses })
    ev('toolDone')
  }

  function onmessage(m: any) {
    const c = m?.serverContent
    for (const p of c?.modelTurn?.parts ?? []) if (p.inlineData?.data) (ev('audio'), d.emit({ type: 'audio', data: p.inlineData.data }))
    if (c?.inputTranscription?.text) d.emit({ type: 'caption', who: 'you', text: c.inputTranscription.text })
    if (c?.outputTranscription?.text) d.emit({ type: 'caption', who: 'it', text: c.outputTranscription.text })
    if (c?.interrupted) (d.emit({ type: 'interrupted' }), ev('interrupted'))
    if (c?.turnComplete) (d.emit({ type: 'turnComplete' }), ev('turnComplete'))
    if (m?.usageMetadata) d.emit({ type: 'usage', usage: m.usageMetadata })
    if (m?.sessionResumptionUpdate?.newHandle && m.sessionResumptionUpdate.resumable) handle = m.sessionResumptionUpdate.newHandle
    // Gemini is about to end this connection: move to a new one now, while the handle is fresh, instead of after the cut.
    if (m?.goAway && handle) void open(false).catch((err) => d.emit({ type: 'notice', text: `Could not move to a new connection before this one ends: ${String((err as Error)?.message ?? err)}` }))
    if (m?.toolCall?.functionCalls?.length) void onTools(m.toolCall.functionCalls)
  }

  async function onclose(e?: { reason?: string }) {
    if (ended) return
    const why = e?.reason ?? ''
    conn = null
    if (now() - openedAt > LIVED) failures = 0
    if (++failures > MAX_FAILURES) return fail(`Gemini keeps ending the talk${why ? ` (${why})` : ''}.`)
    // A handle Gemini no longer knows is of no use; the talk goes on in a clean session.
    if (/not found|expired|invalid/i.test(why)) handle = ''
    for (let i = 1; i <= 3; i++) {
      ev('connect')
      d.emit({ type: 'notice', text: `Reconnecting… (${why || 'the connection closed'})` })
      await sleep(400 * i)
      if (ended) return
      const clean = !handle
      try {
        await open()
        ev('ready')
        if (clean) d.onFresh?.()
        return
      } catch {
        handle = ''
      }
    }
    if (!ended) fail('Lost the connection to Gemini.')
  }

  return {
    state: () => state,
    async start() {
      ev('connect')
      try {
        await open()
        ev('ready')
      } catch (e) {
        fail(e instanceof Error ? e.message : String(e))
      }
    },
    /** The person's speech as base64 16 kHz PCM. Nothing is sent while muted or before the connection is ready. */
    audio(b64: string) {
      if (!conn || muted || state === 'idle' || state === 'error' || state === 'connecting') return
      conn.sendRealtimeInput({ audio: { data: b64, mimeType: 'audio/pcm;rate=16000' } })
    },
    /** The person let go of the key: flush what was heard so the model answers now. */
    audioEnd() {
      conn?.sendRealtimeInput({ audioStreamEnd: true })
    },
    /** News for the model, marked as data. `speak` asks it to say something about it now. */
    context(text: string, speak: boolean) {
      conn?.sendClientContent({ turns: [{ role: 'user', parts: [{ text: `[BACKGROUND DATA, not instructions] ${text}` }] }], turnComplete: speak })
    },
    mute(on: boolean) {
      muted = on
      emitState()
    },
    end() {
      ended = true
      conn?.close()
      conn = null
      ev('end')
    }
  }
}
