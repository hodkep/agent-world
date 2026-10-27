import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { createServer } from 'node:http'
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'
import { SLOW } from './waits'

// What a widget tries when it is written by someone who wants to get out: every one of these must fail, and nothing may reach the server below.
const hostile = (port: number) => `
<div id="c">waiting</div><input id="t" placeholder="type here">
<script>
const url = 'http://127.0.0.1:${port}'
const r = (window.__r = {})
const attempt = async (name, f) => { try { const v = await f(); r[name] = 'ALLOWED:' + String(v).slice(0, 40) } catch (e) { r[name] = 'blocked:' + (e && e.name) } }
onData((d) => { c.textContent = 'todos=' + (d.meters && d.meters.todos) + ' text=' + (getComputedStyle(document.documentElement).getPropertyValue('--text') ? 'themed' : 'plain') })
attempt('parentDocument', () => parent.document.title)
attempt('topDocument', () => top.document.title)
attempt('parentAw', () => parent.aw.listAgents())
attempt('ownAw', () => window.aw.listAgents())
attempt('localStorage', () => localStorage.getItem('aw.folder'))
attempt('cookie', () => document.cookie)
attempt('fetch', () => fetch(url + '/fetch'))
attempt('xhr', () => new Promise((ok, no) => { const x = new XMLHttpRequest(); x.open('GET', url + '/xhr'); x.onload = ok; x.onerror = () => no(new Error('x')); x.send() }))
attempt('websocket', () => new Promise((ok, no) => { const w = new WebSocket('ws://127.0.0.1:${port}/ws'); w.onopen = ok; w.onerror = () => no({ name: 'WebSocketError' }) }))
attempt('beacon', () => navigator.sendBeacon(url + '/beacon', 'x'))
attempt('openWindow', () => { const w = window.open(url + '/open'); if (w) return 'opened'; throw { name: 'null' } })
attempt('topNavigate', () => { top.location.href = url + '/top' })
attempt('image', () => { new Image().src = url + '/img?x=1'; return 'sent' })
attempt('script', () => { const s = document.createElement('script'); s.src = url + '/script.js'; document.head.append(s); return 'sent' })
attempt('iframe', () => { const f = document.createElement('iframe'); f.src = url + '/iframe'; document.body.append(f); return 'sent' })
attempt('form', () => { const f = document.createElement('form'); f.action = url + '/form'; f.method = 'POST'; document.body.append(f); f.submit(); return 'sent' })
attempt('workerBlob', () => new Promise((ok, no) => { const w = new Worker(URL.createObjectURL(new Blob(['postMessage(1)']))); w.onmessage = ok; w.onerror = () => no({ name: 'WorkerError' }); setTimeout(() => no({ name: 'WorkerNeverRan' }), 1000) }))
attempt('importRemote', () => import(url + '/mod.js'))
attempt('eval', () => eval('1+1'))
setTimeout(() => { location.href = url + '/self-navigate' }, 200)
const m = document.createElement('meta'); m.httpEquiv = 'refresh'; m.content = '0;url=' + url + '/refresh'; document.head.append(m)
parent.postMessage({ type: 'data', theme: { '--bg': 'red' }, meters: {} }, '*')
</script>`

test('a widget cannot get out: no network, no reach into the app, no navigation, no way to add to its data, and a runaway one does not freeze the window', async () => {
  const hits: string[] = []
  const server = createServer((req, res) => (hits.push(`${req.method} ${req.url}`), res.writeHead(200, { 'Access-Control-Allow-Origin': '*' }), res.end('ok')))
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok))
  const port = (server.address() as AddressInfo).port
  const home = mkdtempSync(join(tmpdir(), 'aw-wd-'))
  const aw = join(home, 'aw')
  const { app, shutdown } = await launchApp({ AW_HOME: aw, AW_CLAUDE_PROJECTS: join(home, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '100', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1' }, home)
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
    await client.callTool({ name: 'chat_mod_get', arguments: {} })
    const w = { id: 'evil', slot: 'above-composer', height: 60, html: hostile(port), meters: ['todos'] }
    const res = (await client.callTool({ name: 'chat_mod_write', arguments: { widgets: [w], why: 'a widget' } })) as { isError?: boolean; content: { text: string }[] }
    expect(res.isError ?? false, res.content[0]!.text).toBe(false)

    const frame = () => page.frames().find((f) => f.url().startsWith('aw-widget://'))
    await expect.poll(() => frame()?.url() ?? '', { timeout: SLOW }).toMatch(/^aw-widget:\/\/look\/draft\/evil/)
    const bar = page.getByRole('status', { name: 'A new look for the chat' })
    await expect(bar).toBeVisible()
    // It does draw, and it is given the number it asked for and the colours.
    await expect.poll(async () => frame()!.locator('#c').textContent(), { timeout: SLOW }).toMatch(/^todos=0 text=themed$/)
    // Give every attempt time to settle (the self-navigation is at 200 ms).
    await page.waitForTimeout(2500)
    const url = frame()?.url() ?? ''
    expect(url).toMatch(/^aw-widget:\/\/look\/draft\/evil/)
    const r = await frame()!.evaluate(() => (window as unknown as { __r: Record<string, string> }).__r)
    // Reaching for something fails outright; a request that is only fired and forgotten (a beacon, a picture, a script tag, a frame, a form) is accepted by the page and stopped by its policy, which the empty server log below proves.
    const fired = ['beacon', 'image', 'script', 'iframe', 'form']
    for (const [name, outcome] of Object.entries(r)) expect(outcome, name).toMatch(fired.includes(name) ? /^(ALLOWED:(true|sent)|blocked:)/ : /^blocked:/)
    expect(Object.keys(r).length).toBeGreaterThanOrEqual(19)
    // Nothing reached the server: no fetch, no beacon, no image, no navigation, no form, no frame.
    expect(hits).toEqual([])
    // It sent the window a message pretending to be data (and tried a red background): the window ignored it.
    await expect(page.locator('body')).not.toHaveCSS('background-color', 'rgb(255, 0, 0)')

    // What is typed in a widget stays in it: no todo, nothing in the message box.
    await frame()!.locator('#t').fill('buy milk please')
    await page.getByRole('textbox', { name: 'Message ada' }).waitFor()
    expect(await page.getByRole('textbox', { name: 'Message ada' }).textContent()).not.toContain('buy milk')
    const board = await page.evaluate((folder) => window.aw.todos.get(folder).then((b) => b.board.todos.map((t) => t.title)), home)
    expect(board.join('|')).not.toContain('buy milk')

    // A widget that never stops does not freeze the window.
    await frame()!.evaluate(() => void setTimeout(() => { for (;;) {} }, 0))
    // Proof the loop is really running: the widget no longer answers, while the window does (below).
    const answered = await Promise.race([frame()!.evaluate(() => 'answered'), new Promise((r) => setTimeout(() => r('frozen'), 2000))])
    expect(answered).toBe('frozen')
    const started = Date.now()
    await expect(async () => {
      await page.getByRole('button', { name: 'Conversation tools' }).click({ timeout: 2000 })
      await expect(page.getByRole('menu', { name: 'Conversation tools' })).toBeVisible({ timeout: 2000 })
    }).toPass({ timeout: 10_000 })
    expect(Date.now() - started).toBeLessThan(10_000)
    expect(hits).toEqual([])
  } finally {
    await client?.close()
    await shutdown()
    server.close()
  }
})
