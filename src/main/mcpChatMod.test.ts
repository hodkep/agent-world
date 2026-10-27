import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { afterEach, describe, expect, it } from 'vitest'
import { EMPTY_MOD } from '../shared/chatMod'
import { startMcpServer } from './mcpServer'

type Mod = NonNullable<Parameters<typeof startMcpServer>[0]['chatMod']>
let server: Awaited<ReturnType<typeof startMcpServer>> | undefined
let client: Client | undefined
afterEach(async () => {
  await client?.close()
  server?.close()
})

async function connect(chatMod?: Mod) {
  server = await startMcpServer({ chatMod, agentForToken: (t) => (t === 'tok' ? 'a1' : null), listAgents: () => [], send: () => 'queued', remember: () => {}, recall: () => [] })
  client = new Client({ name: 'test', version: '1' })
  await client.connect(new StreamableHTTPClientTransport(new URL(server.url), { requestInit: { headers: { Authorization: 'Bearer tok' } } }))
  return client
}
const text = (r: unknown) => (r as { content: { text: string }[] }).content[0]!.text
const isErr = (r: unknown) => (r as { isError?: boolean }).isError === true
const state = { current: EMPTY_MOD, draft: null, draftBy: null, draftWhy: '', history: 0, draftData: false }

describe('the chat look tools: an agent reads and writes a draft, only the person keeps it', () => {
  it('are offered only when the app supports them', async () => {
    const c = await connect()
    expect((await c.listTools()).tools.map((t) => t.name).filter((n) => n.startsWith('chat_mod'))).toEqual([])
  })

  it('give the agent the guide and what is in force', async () => {
    const c = await connect({ state: () => ({ ...state, current: { layout: { rules: [] }, css: '.a{}', widgets: [] } }), write: () => ({ problems: [] }) })
    expect(text(await c.callTool({ name: 'chat_mod_guide', arguments: {} }))).toContain('chat_mod_write')
    expect(JSON.parse(text(await c.callTool({ name: 'chat_mod_get', arguments: {} }))).current.css).toBe('.a{}')
  })

  it('hand the draft over as the calling agent and say it stays only if the person keeps it', async () => {
    const seen: unknown[] = []
    const c = await connect({ state: () => state, write: (who, i) => (seen.push([who, i]), { problems: [] }) })
    const r = await c.callTool({ name: 'chat_mod_write', arguments: { css: ':root { --accent: #f60 }', layout: [{ match: { kind: ['thinking'] }, place: 'hidden' }], why: 'orange accent, no thinking' } })
    expect(seen).toEqual([['a1', { css: ':root { --accent: #f60 }', layout: [{ match: { kind: ['thinking'] }, place: 'hidden' }], why: 'orange accent, no thinking' }]])
    expect(text(r)).toMatch(/only if they keep it/)
    expect(text(r)).toContain('The draft holds')
  })

  it('tell the agent what could not be read, so it fixes it and writes again', async () => {
    const c = await connect({ state: () => state, write: () => ({ problems: ['@import is not allowed.'] }) })
    const r = await c.callTool({ name: 'chat_mod_write', arguments: { css: '@import url(x);', why: 'x' } })
    expect(isErr(r)).toBe(true)
    expect(text(r)).toMatch(/Nothing was changed.*@import/)
  })

  it('refuse a call that gives nothing, or a place that does not exist, without writing', async () => {
    const seen: unknown[] = []
    const c = await connect({ state: () => state, write: (_w, i) => (seen.push(i), { problems: [] }) })
    expect(isErr(await c.callTool({ name: 'chat_mod_write', arguments: { why: 'x' } }))).toBe(true)
    expect(isErr(await c.callTool({ name: 'chat_mod_write', arguments: { layout: [{ match: {}, place: 'sideways' }], why: 'x' } }))).toBe(true)
    expect(seen).toHaveLength(0)
  })

  it('let the agent look at the app: an outline of its elements, and a picture of the window', async () => {
    const asked: unknown[] = []
    const c = await connect({ state: () => state, write: () => ({ problems: [] }), outline: async (sel, depth) => (asked.push([sel, depth]), 'div.app\n  header'), screenshot: async (who) => (asked.push(who), 'iVBORw0KGgo=') })
    expect(text(await c.callTool({ name: 'app_ui_outline', arguments: { selector: 'main', depth: 2 } }))).toBe('div.app\n  header')
    expect(text(await c.callTool({ name: 'app_ui_outline', arguments: {} }))).toBe('div.app\n  header')
    expect(asked).toEqual([['main', 2], ['', 4]])
    const shot = (await c.callTool({ name: 'app_ui_screenshot', arguments: {} })) as { content: { type: string; data: string; mimeType: string }[] }
    expect(shot.content[0]).toEqual({ type: 'image', data: 'iVBORw0KGgo=', mimeType: 'image/png' })
    expect(asked).toContain('a1')
  })

  it('say plainly when the person did not allow a picture, or there is no window', async () => {
    const c = await connect({ state: () => state, write: () => ({ problems: [] }), screenshot: async () => null })
    expect(isErr(await c.callTool({ name: 'app_ui_screenshot', arguments: {} }))).toBe(true)
    expect(isErr(await c.callTool({ name: 'app_ui_outline', arguments: {} }))).toBe(true)
  })

  it('hand widgets over with the rest, and refuse one with a slot, a number or a size that does not exist', async () => {
    const seen: unknown[] = []
    const c = await connect({ state: () => state, write: (_w, i) => (seen.push(i), { problems: [] }) })
    const w = { id: 'spend', slot: 'above-composer', height: 30, html: '<b>x</b>', meters: ['cost'] }
    await c.callTool({ name: 'chat_mod_write', arguments: { widgets: [w], why: 'a spend line' } })
    expect(seen).toEqual([{ widgets: [w], why: 'a spend line' }])
    for (const bad of [{ ...w, slot: 'floating' }, { ...w, meters: ['everything'] }, { ...w, height: 9999 }]) expect(isErr(await c.callTool({ name: 'chat_mod_write', arguments: { widgets: [bad], why: 'x' } }))).toBe(true)
    expect(seen).toHaveLength(1)
  })

  it('pass reset through, to ask for the system default', async () => {
    const seen: unknown[] = []
    const c = await connect({ state: () => state, write: (_w, i) => (seen.push(i), { problems: [] }) })
    await c.callTool({ name: 'chat_mod_write', arguments: { reset: true, why: 'back to normal' } })
    expect(seen).toEqual([{ reset: true, why: 'back to normal' }])
  })
})
