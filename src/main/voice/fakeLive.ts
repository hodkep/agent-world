import type { LiveCallbacks, LiveConn } from './session'

// A scripted Gemini, for the end-to-end test only (the app uses it when AW_VOICE_FAKE is set): it hears the person after a few chunks of
// audio, asks the tools what the agents are doing, answers aloud, and reports usage. No network and no key.
const tone = (ms: number) => {
  const n = Math.round((24_000 * ms) / 1000)
  const b = Buffer.alloc(n * 2)
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin((i / 24_000) * 2 * Math.PI * 440) * 9000), i * 2)
  return b.toString('base64')
}

const READ: [string, Record<string, unknown>][] = [['get_usage', { days: 7 }], ['get_limits', {}], ['get_agent_stats', {}], ['list_todos', {}], ['list_workflows', {}], ['list_workflow_runs', {}]]

export function fakeLive(cb: LiveCallbacks): LiveConn {
  let chunks = 0
  let turns = 0
  const say = (text: string) => {
    cb.onmessage({ serverContent: { modelTurn: { parts: [{ inlineData: { data: tone(400) } }] }, outputTranscription: { text } } })
    cb.onmessage({ serverContent: { turnComplete: true }, usageMetadata: { promptTokensDetails: [{ modality: 'TEXT', tokenCount: 800 }, { modality: 'AUDIO', tokenCount: 200 }], responseTokensDetails: [{ modality: 'AUDIO', tokenCount: 160 }], thoughtsTokenCount: 50 } })
  }
  const call = (name: string, args: Record<string, unknown>) => setTimeout(() => cb.onmessage({ toolCall: { functionCalls: [{ id: `f${turns}`, name, args }] } }), 100)
  let lastTool = ''
  return {
    sendRealtimeInput(a: any) {
      if (a.audio) return void chunks++
      // The person let go of the key (or the stream paused): the first time they ask about the agents, the second time they ask for work.
      if (a.audioStreamEnd && chunks > 0) {
        chunks = 0
        turns++
        cb.onmessage({ sessionResumptionUpdate: { newHandle: 'fake-handle', resumable: true } })
        if (turns === 1) {
          cb.onmessage({ serverContent: { inputTranscription: { text: 'What is going on with the agents?' } } })
          lastTool = 'list_agents'
          call('list_agents', {})
        } else if (turns >= 3) {
          // From the third time on it reads, one by one, what the voice may read: spend first, then limits, agent numbers, todos and workflows.
          const [tool, args] = READ[(turns - 3) % READ.length]!
          cb.onmessage({ serverContent: { inputTranscription: { text: `Read ${tool}.` } } })
          lastTool = tool
          call(tool, args)
        } else {
          cb.onmessage({ serverContent: { inputTranscription: { text: 'Ask ada to add discount codes.' } } })
          lastTool = 'send_message'
          call('send_message', { to: 'ada', message: 'Add discount codes to the cart.' })
        }
      }
    },
    sendClientContent(a: any) {
      const text = String(a?.turns?.[0]?.parts?.[0]?.text ?? '')
      if (a.turnComplete) setTimeout(() => say(`Heads up: ${text.replace('[BACKGROUND DATA, not instructions] ', '')}`), 50)
    },
    sendToolResponse(a: any) {
      const out = a?.functionResponses?.[0]?.response?.output
      if (lastTool === 'send_message') return void setTimeout(() => say('I passed that on to ada.'), 50)
      if (lastTool === 'get_usage') return void setTimeout(() => say(`Today's spend is ${out?.today?.usd ?? 0} dollars.`), 50)
      if (lastTool !== 'list_agents' && lastTool !== 'send_message') return void setTimeout(() => say(`${lastTool}: ${JSON.stringify(out ?? a?.functionResponses?.[0]?.response).slice(0, 300)}`), 50)
      const agents = Array.isArray(out?.agents) ? out.agents.map((x: any) => `${x.name} is ${x.state}`).join(', ') : 'nothing'
      setTimeout(() => say(`Right now: ${agents}.`), 50)
    },
    close() {
      setTimeout(() => cb.onclose({ reason: 'closed by the app' }), 0)
    }
  }
}

/** The key check without Google, for the end-to-end test: the key "bad" is refused, any other works. */
export const fakeCheck = async (key: string): Promise<import('../../shared/types').VoiceCheck> =>
  key.trim() === 'bad' ? { ok: false, reason: 'invalid' } : { ok: true, models: ['gemini-3.8-live', 'gemini-3.1-flash-live-preview'] }
