import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'
import { SLOW } from './waits'

// A figure the app has no meter for (cache hit rate), asked for by name from the agent's own telemetry: the fake program reports two requests the way Claude does.
// Read from fake-claude.mjs: reads 10+800+100 and 5+900+0 tokens fresh, from the cache and written, 800+900 of them from the cache.
const HIT = 1700 / (910 + 905)

test('a widget can show a figure made from the agent\'s own telemetry, which no ready-made meter gives, and an unreported one stays empty', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-ser-'))
  const aw = join(home, 'aw')
  const { app, shutdown } = await launchApp({ AW_HOME: aw, AW_CLAUDE_PROJECTS: join(home, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_OTLP: '1' }, home)
  let client: Client | undefined
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const agentDir = join(aw, 'agents', readdirSync(join(aw, 'agents'))[0]!)
    const cfg = JSON.parse(readFileSync(join(agentDir, 'mcp.json'), 'utf8')).mcpServers['agent-world']
    client = new Client({ name: 'ada', version: '1' })
    await client.connect(new StreamableHTTPClientTransport(new URL(cfg.url), { requestInit: { headers: cfg.headers } }))

    const catalog = ((await client.callTool({ name: 'app_ui_readings', arguments: {} })) as { content: { text: string }[] }).content[0]!.text
    expect(catalog).toContain('firstTokenMs')

    await client.callTool({ name: 'chat_mod_get', arguments: {} })
    const series = [
      { id: 'hit', kind: 'request', of: ['cacheRead'], op: 'ratio', per: ['input', 'cacheRead', 'cacheWrite'], over: 'last:20' },
      { id: 'reqs', kind: 'request', of: [], op: 'count', over: 'last:20' },
      { id: 'first', kind: 'request', of: ['firstTokenMs'], op: 'avg', over: 'last:20' }
    ]
    const html = `<div id=c style="font:12px monospace;padding:4px 10px">waiting</div><script>onData((d) => { const s = d.series || {}; c.textContent = 'hit=' + (s.hit == null ? 'none' : s.hit.toFixed(3)) + ' reqs=' + s.reqs + ' first=' + (s.first == null ? 'none' : s.first) })</script>`
    const res = (await client.callTool({ name: 'chat_mod_write', arguments: { widgets: [{ id: 'hit', slot: 'above-composer', height: 32, html, series }], why: 'cache hit rate' } })) as { isError?: boolean; content: { text: string }[] }
    expect(res.isError ?? false, res.content[0]!.text).toBe(false)

    const frame = () => page.frames().find((f) => f.url().startsWith('aw-widget://'))
    await expect.poll(() => frame()?.url() ?? '', { timeout: SLOW }).toMatch(/^aw-widget:\/\/look\/draft\/hit/)
    await expect.poll(async () => (await frame()?.locator('#c').textContent().catch(() => '')) ?? '', { timeout: SLOW }).toBe(`hit=${HIT.toFixed(3)} reqs=2 first=none`)

    // A series the app does not know how to make is refused with the reason, and nothing is written.
    const bad = (await client.callTool({ name: 'chat_mod_write', arguments: { widgets: [{ id: 'x', slot: 'chat-top', html: '<b></b>', series: [{ id: 'a', kind: 'request', of: ['prompt'], op: 'sum', over: 'turn' }] }], why: 'x' } })) as { isError?: boolean; content: { text: string }[] }
    expect(bad.isError).toBe(true)
    expect(bad.content[0]!.text).toMatch(/prompt/)
  } finally {
    await client?.close()
    await shutdown()
  }
})
