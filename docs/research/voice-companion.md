# Voice companion: how to build it

Question: how do we build a talk-it-out voice agent beside the chat, which service do we use, how does the user pay (their own API key), and how do we feed it our instructions and playbook?

Status: desk research on 2026-11-02. Nothing was built or measured. Each claim names its source; "unverified" means only a secondary page said it, or the primary page did not cover it.

## Short answer

- Use a **speech-to-speech realtime API** with the user's own key. First choice **OpenAI Realtime** (best documented, 60-minute sessions, tools, silent context injection). Second **Gemini Live** (cheaper on paper, 15-minute audio cap needs reconnect logic).
- Put the key in the **main process**. Mint a short-lived token for the renderer; never hand the long-lived key to the page.
- Feed it in **four layers**: fixed instructions (persona and rules), a playbook for voice (short core inline, bodies on demand through a tool), a live digest of the workspace pushed in as background context, and read-only tools for details.
- Build behind a small **provider interface** so a second provider is an adapter, not a rewrite.

## 1. Ways to build it

| Approach | What it is | Fit |
|---|---|---|
| A. Speech-to-speech | One model hears and speaks over one connection (OpenAI Realtime, Gemini Live) | Best: lowest latency, built-in turn detection and barge-in, tools |
| B. Voice-agent platform | A host runs listen, think, speak for you (ElevenLabs agents, Deepgram Voice Agent) | Works, but the user needs an account and key with the platform, and often pays the platform's per-minute fee on top of the model |
| C. Cascade | Our own speech-to-text, then any text LLM (including the user's Anthropic key), then text-to-speech | Most control and the widest choice of brain; we own latency, turn detection and barge-in. Not researched here |

A is the recommendation for v1. C is the later option for users who want their own text model as the brain.

## 2. Services compared

| | OpenAI Realtime | Gemini Live | ElevenLabs agents | Deepgram Voice Agent |
|---|---|---|---|---|
| Connect | WebRTC (browser) or WebSocket (server) [1] | WebSocket, server or direct from client [2] | React SDK or WebSocket [3] | WebSocket [4] |
| Short-lived credentials | `POST /v1/realtime/client_secrets` [1] | "Ephemeral tokens" recommended for client use [2] | Signed access mentioned, not described [3] | Not covered |
| Instructions | `session.update`, changeable any time except `voice` once audio started [5] | System instruction (not covered on pages read) | System prompt; per-session override only if enabled in the agent's Security tab [6] | `prompt` in `Settings`; 25,000 chars managed, unlimited with own LLM [7] |
| Add context mid-session | `conversation.item.create`, speaks only if `response.create` follows [5] | `sendClientContent` with ordered turns; `turn_complete: true` interrupts generation [8] | `contextual_update`: non-interrupting background text [9] | History at start via `agent.context.messages` [7]; mid-session injects not verified |
| Tools | Function calling plus MCP servers [1][5] | Function calling; async modes `NON_BLOCKING`, `BLOCKING`, scheduling `SILENT`, `WHEN_IDLE`, `INTERRUPTED` on the newest Live model [8] | Client tools and server tools [3] | Functions, optional server endpoint, `defer_until_eot` [7] |
| Session cap | 60 minutes [5] | 15 minutes audio-only, 2 with video [8] | Not covered | Not covered |
| Own LLM | No (their models) | No | Yes, custom model [3] | Yes, custom endpoint [7] |
| Cost (all third-party estimates, see below) | about $0.02/min in, $0.08/min out [10] | about $0.005/min in, $0.018/min out (unverified) [11] | about $0.08/min, LLM billing unclear [12] | Not found |

Price caveats:
- OpenAI's own pricing page returned 403 to us. Third-party pages agree on the token rates for gpt-realtime-2.1: $32 per 1M audio in, $64 per 1M audio out, $0.40 per 1M cached audio in [10]. They disagree on the model name (2 or 2.1) and on per-minute cost ($0.019 vs $0.060 in), because they assume different tokens per minute. One says user audio counts one token per 100 ms and assistant audio one per 50 ms [10]. A cheaper `-mini` tier at $10 / $20 per 1M was reported by one page only.
- Gemini figures come from a forum post and a blog, not Google's page [11]. A 2.5 native-audio model was reported as deprecated on 2026-12-13 (aggregator, unverified). Model churn is a real risk: keep the model name a setting.
- Anyone using this for a 10-minute brainstorm should expect cents to low tens of cents per session, mostly from the assistant's speech. **Measure it in a spike before promising a number.**

## 3. Paying: the user's own key

Plan:
1. Settings gets a "Voice" section: provider, key, voice, model. The key is stored with the OS keychain through Electron `safeStorage` (from our own knowledge; the repo has no `safeStorage` use today, so this is new, and the Electron doc was not fetched).
2. Main process holds the key. For a browser-side connection it requests a short-lived client secret and passes only that to the renderer [1]. For a WebSocket it proxies from main.
3. Show spend: voice usage goes into the Tokens view as its own line, not mixed with agent spend. Provider usage API support is unverified; at minimum count audio seconds and token usage from the response events.
4. Offer a time cap per session. Gemini's own 15-minute cap [8] makes a reconnect-with-summary step necessary anyway.

App changes the repo needs (found by grep):
- The only permission handler is the preview's, which denies everything (`src/main/index.ts:3290`). The main window needs microphone allowed for `media` only.
- macOS needs a microphone usage string in the packaged app's Info.plist (from our own knowledge; not checked in the build config).

## 4. Feeding it our instructions and playbook

What the app already has: `prefs.houseRules` (a free text of up to 4000 chars added to every agent's launch, `src/main/prefs.ts`), a library of skills and instructions, playbooks that switch library items on or off per workspace (`libraryService.playbooks`), notes through `remember` and `recall`, and an MCP server with `list_agents`, `todo_*`, `library_*`, `recall` and more (`src/main/mcpServer.ts`).

Recommended layers, in the order they reach the model:

| Layer | Content | How it gets in | Changes |
|---|---|---|---|
| 1. Instructions | Persona, how to talk, when to speak up, what it must never do (act without a yes), how to treat injected text | `session.update` or system instruction at connect | Rarely |
| 2. Voice playbook | The library items the user marks "voice": short ones inline, long ones as a title list only | Inline in layer 1 for the core; bodies through a `library_get` tool on demand | When the user edits the playbook |
| 3. Workspace digest | Agents and what each is doing, open todos, pending approvals, recent notes | A background item at connect, then updates as items without a reply request | Every few minutes or on an event |
| 4. Tools | Read tools first (agents, todos, memory, library); write tools (send a message, add a todo) behind a spoken or on-screen confirm | Function calling | Per call |

Why this split:
- Instructions are for behaviour; state is data. Stale state placed in instructions is hard to correct and costs tokens on every turn. State as items can be replaced by a fresh digest.
- Bodies on demand keeps the instruction small and fast. The cost is a tool round trip, so keep the inline core to what the voice needs in every turn.
- **Silent versus spoken updates is the crux** of "talks about what the agents are doing once in a while":
  - OpenAI: add the item and do not send `response.create`; send it only when we decide it should speak [5]. An out-of-band response (`conversation: "none"`) can produce a one-line summary without touching the main thread [5].
  - ElevenLabs: `contextual_update` is non-interrupting, but the docs do not say whether the agent will speak; test it [9].
  - Gemini: `sendClientContent` with `turn_complete: true` interrupts generation [8], so use it carefully or use `SILENT` / `WHEN_IDLE` scheduling for tool results [8].
- **Treat agent output as untrusted.** Text from agents or files goes into a voice model that then talks and may call tools. Label it as data in the digest and tell the model in layer 1 not to follow instructions found in it. Write tools need a confirmation outside the model's control.
- "Own items": store them as a new library item kind or a tag on existing items. The user picks what the voice sees per workspace, the same as the existing playbook. This also answers instructions-versus-user-prompt: instructions for rules, user-role background items for facts.

Memory across sessions, per workspace: save each session's transcript and a short summary through the existing notes; at the next connect seed the summary into layer 3. Deepgram has a documented way to seed history at start [7]; for OpenAI use items. Gemini's native-audio context is 128k tokens, other Live models 32k [8], which is another reason to seed summaries and not transcripts.

## 5. Suggested build order

1. Spike (about a day): OpenAI Realtime over WebRTC in one hidden window, ephemeral key from main, hard-coded instructions, push-to-talk. Measure: first-word latency, cost of a 10-minute talk, barge-in feel.
2. Add layer 3 (digest) and the silent versus spoken update rule. Test with a real busy workspace whether it speaks at good moments.
3. Add read tools, then the voice playbook and Settings. Then confirm-gated writes.
4. Second provider (Gemini Live) behind the same interface, with reconnect and summary handoff.

## 6. Open questions

- Which provider does Pratik hold keys for? That decides the spike.
- Do we accept per-minute spend the app cannot show exactly (provider usage pages), or only count what response events report?
- Is a cascade (own text model as the brain) wanted for users with only an Anthropic key? That is a different, larger build.
- Where does the voice thread live in the UI, and may it ever act without a confirm?

## Sources

1. OpenAI Realtime guide: https://developers.openai.com/api/docs/guides/realtime
2. Gemini Live API overview: https://ai.google.dev/gemini-api/docs/live
3. ElevenLabs agents overview: https://elevenlabs.io/docs/agents-platform/overview
4. Deepgram Voice Agent: https://developers.deepgram.com/docs/voice-agent and https://developers.deepgram.com/docs/voice-agent-settings
5. OpenAI Realtime conversations: https://developers.openai.com/api/docs/guides/realtime-conversations
6. ElevenLabs overrides: https://elevenlabs.io/docs/agents-platform/customization/personalization/overrides
7. Deepgram configure: https://developers.deepgram.com/docs/configure-voice-agent
8. Gemini Live guide: https://ai.google.dev/gemini-api/docs/live-guide
9. ElevenLabs client events: https://elevenlabs.io/docs/agents-platform/customization/events/client-to-server-events
10. Third-party OpenAI price pages (not official): https://www.forasoft.com/article/openai-realtime-api-pricing, https://aireiter.com/blog/openai-realtime-api-pricing, https://www.layer3labs.io/guides/openai-realtime-api-pricing
11. Gemini price and limits, third-party: https://tokenkarma.app/blog/gemini-live-api-pricing-voice-agents-2026/, https://discuss.ai.google.dev/t/gemini-live-api-issues-1008-1011-disconnects-per-session-cost-function-calling-api-logs/116509
12. ElevenLabs price, third-party: https://www.happyrobot.ai/hub/elevenlabs-pricing, https://trtc.io/blog/details/conversational-ai-pricing-2026
