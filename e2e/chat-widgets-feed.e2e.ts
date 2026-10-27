import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'
import { SLOW } from './waits'

const QUOTE = 'https://query1.finance.yahoo.com/v8/finance/chart/TCS.NS?range=1d&interval=1d'
const DOWN = 'https://down.example.com/q'
const HOSTILE = 'https://hostile.example.com/q'

// A bar of quotes, written the way the guide tells an agent to: loaded text goes on the page with textContent.
const bar = `<div id=q style='padding:4px 10px;font:11px monospace'>waiting</div><script>onData(d => { const f = d.feeds.tcs; if (!f) return; if (!f.ok) { q.textContent = 'TCS unavailable'; return } const m = JSON.parse(f.text).chart.result[0].meta; q.textContent = 'TCS ' + m.regularMarketPrice + ' ' + m.currency })</script>`
// The mistake the guide warns about: loaded text put on the page as markup. What it carries must still not run.
const careless = `<div id=q>waiting</div><script>onData(d => { const f = d.feeds.h; if (f && f.ok) q.innerHTML = f.text })</script>`

test('a widget can show data loaded from the internet by the app: nothing loads until allowed, the data is text, a failure says so, and what is loaded cannot run', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-feed-'))
  const aw = join(home, 'aw')
  const stub = join(home, 'feeds.json')
  writeFileSync(stub, JSON.stringify({ [QUOTE]: { body: JSON.stringify({ chart: { result: [{ meta: { regularMarketPrice: 2496.9, currency: 'INR' } }] } }) }, [DOWN]: { status: 429 }, [HOSTILE]: { body: '<img src=x onerror="window.__ran=1"><b id=b>bold</b>' } }))
  const { app, shutdown } = await launchApp({ AW_HOME: aw, AW_CLAUDE_PROJECTS: join(home, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '100', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', AW_WIDGET_FETCH_STUB: stub }, home)
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
    const write = async (widgets: unknown[]) => {
      await client!.callTool({ name: 'chat_mod_get', arguments: {} })
      const r = (await client!.callTool({ name: 'chat_mod_write', arguments: { widgets, why: 'a quotes bar' } })) as { isError?: boolean; content: { text: string }[] }
      return { err: !!r.isError, text: r.content[0]!.text }
    }
    const frame = () => page.frames().find((f) => f.url().startsWith('aw-widget://'))
    const bottom = { id: 'quotes', slot: 'window-bottom', height: 28, html: bar, fetch: [{ id: 'tcs', url: QUOTE, every: 60 }] }

    // A widget that is given the app's numbers cannot also load data.
    const both = await write([{ ...bottom, meters: ['cost'] }])
    expect(both.err).toBe(true)
    expect(both.text).toMatch(/never both/)
    // Neither can an address that is not a public https one.
    expect((await write([{ ...bottom, fetch: [{ id: 'x', url: 'https://127.0.0.1/x' }] }])).err).toBe(true)

    // The draft shows, says where it would load from, and loads nothing yet.
    expect((await write([bottom])).err).toBe(false)
    const barUi = page.getByRole('status', { name: 'A new look for the chat' })
    await expect(barUi).toContainText('Loads data from query1.finance.yahoo.com once you allow it')
    await expect.poll(() => frame()?.url() ?? '', { timeout: SLOW }).toMatch(/draft\/quotes/)
    await expect(frame()!.locator('#q')).toHaveText('waiting')
    await page.waitForTimeout(1500)
    await expect(frame()!.locator('#q')).toHaveText('waiting')

    // Load data: it loads, and the bar sits across the bottom of the window.
    await barUi.getByRole('button', { name: 'Load data' }).click()
    await expect(frame()!.locator('#q')).toHaveText('TCS 2496.9 INR', { timeout: SLOW })
    const box = await page.locator('.wd-slot.window-bottom').boundingBox()
    const win = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
    expect(box!.y + box!.height).toBeGreaterThan(win.height - 4)
    expect(box!.width).toBeGreaterThan(win.width * 0.9)
    await page.screenshot({ path: join(__dirname, '..', 'test-results', 'widget-quotes.png') })

    // Undo: gone, and nothing is kept.
    await barUi.getByRole('button', { name: 'Undo' }).click()
    await expect(page.locator('.wd-slot.window-bottom')).toHaveCount(0)

    // Keep starts loading by itself, and a site that fails says so rather than showing an old number.
    await write([bottom, { id: 'down', slot: 'chat-top', height: 24, html: bar.replace(/tcs/g, 'dn'), fetch: [{ id: 'dn', url: DOWN }] }])
    await barUi.getByRole('button', { name: 'Keep' }).click()
    await expect.poll(async () => frame()?.url() ?? '', { timeout: SLOW }).toMatch(/current\//)
    await expect.poll(async () => page.frames().filter((f) => f.url().startsWith('aw-widget://')).length).toBe(2)
    const texts = async () => Promise.all(page.frames().filter((f) => f.url().startsWith('aw-widget://')).map((f) => f.locator('#q').textContent()))
    await expect.poll(texts, { timeout: SLOW }).toEqual(expect.arrayContaining(['TCS 2496.9 INR', 'TCS unavailable']))

    // What is loaded is text. A widget that puts it on the page as markup (the mistake the guide warns about) still cannot run it.
    await write([{ id: 'careless', slot: 'above-composer', height: 40, html: careless, fetch: [{ id: 'h', url: HOSTILE }] }])
    await barUi.getByRole('button', { name: 'Load data' }).click()
    const careful = () => page.frames().find((f) => f.url().includes('draft/careless'))!
    await expect(careful().locator('#b')).toHaveText('bold', { timeout: SLOW }) // the markup was drawn...
    await page.waitForTimeout(800)
    expect(await careful().evaluate(() => (window as unknown as { __ran?: number }).__ran)).toBeUndefined() // ...and its handler did not run
    await barUi.getByRole('button', { name: 'Undo' }).click()
  } finally {
    await client?.close()
    await shutdown()
  }
})
