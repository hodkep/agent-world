import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'
import { SLOW } from './waits'

// Fireworks, as an agent would write them from the guide: a rocket per key press, thrown with the speed that makes gravity bring it to rest where it bursts, then sparks with drag, gravity, twinkle and a fade.
const FIREWORKS = `<canvas id=c style="position:fixed;inset:0;width:100%;height:100%"></canvas><script>
const cv = document.getElementById('c'), ctx = cv.getContext('2d')
let W = 0, H = 0
const fit = () => { const dpr = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0) }
addEventListener('resize', fit); fit()
const G = 0.1, rockets = [], sparks = [], flashes = []
const PAL = [['#ff5a5f', '#ffd166'], ['#4cc9f0', '#f72585'], ['#80ed99', '#fff3b0'], ['#c77dff', '#ffffff'], ['#ffb703', '#fb5607']]
const rnd = (a, b) => a + Math.random() * (b - a)
function launch() {
  const x = W * rnd(0.1, 0.9), y = H + 4, tx = W * rnd(0.15, 0.85), ty = H * rnd(0.1, 0.5)
  const vy = -Math.sqrt(2 * G * (y - ty)), t = -vy / G, vx = (tx - x) / t
  rockets.push({ x, y, vx, vy, pal: PAL[Math.random() * PAL.length | 0], trail: [] })
}
function burst(r) {
  const [a, b] = r.pal, n = Math.floor(rnd(70, 120)), v = rnd(2, 3.6), ring = Math.random() < 0.35
  for (let i = 0; i < n; i++) {
    const ang = Math.random() * 6.2832, s = ring ? v : v * Math.sqrt(Math.random())
    sparks.push({ x: r.x, y: r.y, vx: Math.cos(ang) * s, vy: Math.sin(ang) * s, life: 1, decay: rnd(0.006, 0.016), col: Math.random() < 0.55 ? a : b, size: rnd(0.9, 2) })
  }
  while (sparks.length > 900) sparks.shift()
  flashes.push({ x: r.x, y: r.y, a: 1 })
}
let raf = 0, last = 0
function step(ts) {
  const dt = Math.min(2.5, (ts - last) / 16.67 || 1); last = ts
  ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(0, 0, W, H)
  ctx.globalCompositeOperation = 'lighter'
  for (let i = rockets.length - 1; i >= 0; i--) {
    const r = rockets[i]
    r.vy += G * dt; r.vx *= Math.pow(0.999, dt); r.x += r.vx * dt; r.y += r.vy * dt
    r.trail.push([r.x, r.y]); if (r.trail.length > 9) r.trail.shift()
    for (let k = 0; k < r.trail.length; k++) { ctx.fillStyle = 'rgba(255,230,180,' + (k / r.trail.length * 0.7) + ')'; ctx.fillRect(r.trail[k][0] - 1, r.trail[k][1] - 1, 2, 2) }
    if (r.vy >= -0.35) { burst(r); rockets.splice(i, 1) }
  }
  for (let i = sparks.length - 1; i >= 0; i--) {
    const p = sparks[i]
    p.vx *= Math.pow(0.985, dt); p.vy *= Math.pow(0.985, dt); p.vy += G * 0.55 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= p.decay * dt
    if (p.life <= 0) { sparks.splice(i, 1); continue }
    ctx.globalAlpha = Math.max(0, p.life) * (0.6 + 0.4 * Math.random()); ctx.fillStyle = p.col
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.5 + p.life * 0.5), 0, 6.2832); ctx.fill()
  }
  ctx.globalAlpha = 1
  for (let i = flashes.length - 1; i >= 0; i--) {
    const f = flashes[i]; f.a -= 0.12 * dt
    if (f.a <= 0) { flashes.splice(i, 1); continue }
    const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, 40 * f.a + 10); g.addColorStop(0, 'rgba(255,255,255,' + f.a * 0.5 + ')'); g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g; ctx.fillRect(f.x - 60, f.y - 60, 120, 120)
  }
  raf = rockets.length || sparks.length || flashes.length ? requestAnimationFrame(step) : 0
  if (!raf) ctx.clearRect(0, 0, W, H)
}
const kick = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(step) } }
let seen = null
window.__lit = () => { const d = ctx.getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 20) n++; return n }
window.__flying = () => ({ rockets: rockets.length, sparks: sparks.length, raf })
onData((d) => {
  const n = (d.meters && d.meters.typing) || 0
  window.__last = JSON.stringify(d.meters)
  if (seen === null) { seen = n; return }
  const add = Math.min(3, Math.max(0, n - seen)); seen = n
  for (let i = 0; i < add; i++) if (rockets.length < 12) launch()
  if (add) kick()
})
</script>`

test('a widget behind the chat text draws fireworks as you type: it is told only that a key was pressed, clicks go through it, and it stops drawing when nothing moves', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-fw-'))
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
    const w = (await client.callTool({ name: 'chat_mod_write', arguments: { widgets: [{ id: 'fireworks', slot: 'chat-behind', html: FIREWORKS, meters: ['typing'] }], why: 'fireworks while typing' } })) as { isError?: boolean; content: { text: string }[] }
    expect(w.isError ?? false, w.content[0]!.text).toBe(false)

    const frame = () => page.frames().find((f) => f.url().includes('draft/fireworks'))
    await expect.poll(() => frame()?.url() ?? '', { timeout: SLOW }).toMatch(/draft\/fireworks/)
    // It fills the chat panel and sits behind it: clicks and the text above it are the chat's, not the widget's.
    const slot = page.locator('.wd-slot.chat-behind')
    await expect(slot).toHaveCSS('pointer-events', 'none')
    const chat = await page.locator('.chat').boundingBox()
    const sb = await slot.boundingBox()
    expect(Math.abs(sb!.width - chat!.width)).toBeLessThan(2)
    expect(Math.abs(sb!.height - chat!.height)).toBeLessThan(2)
    const top = await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.tagName + '.' + document.elementFromPoint(x!, y!)?.className, [chat!.x + chat!.width / 2, chat!.y + 200])
    expect(top).not.toMatch(/IFRAME/)

    // Nothing has been typed: nothing moves, and the first count is not an event.
    expect(await frame()!.evaluate(() => (window as unknown as { __flying: () => { rockets: number; sparks: number; raf: number } }).__flying())).toEqual({ rockets: 0, sparks: 0, raf: 0 })

    // Type: one rocket per key, and then they burst into sparks.
    const box = page.getByRole('textbox', { name: 'Message ada' })
    await box.click()
    await page.keyboard.type('secret-passw0rd', { delay: 90 })
    await expect.poll(() => frame()!.evaluate(() => (window as unknown as { __flying: () => { rockets: number; sparks: number } }).__flying().rockets + (window as unknown as { __flying: () => { sparks: number } }).__flying().sparks), { timeout: 5000 }).toBeGreaterThan(0)
    await expect.poll(() => frame()!.evaluate(() => (window as unknown as { __lit: () => number }).__lit()), { timeout: 8000 }).toBeGreaterThan(80)
    await page.screenshot({ path: join(__dirname, '..', 'test-results', 'fireworks.png') })
    await page.waitForTimeout(1300)
    await page.screenshot({ path: join(__dirname, '..', 'test-results', 'fireworks-burst.png'), clip: { x: 860, y: 140, width: 580, height: 560 } })

    // It was told how many times the box changed (15) and nothing of what was typed.
    const last = await frame()!.evaluate(() => (window as unknown as { __last: string }).__last)
    expect(last).toBe('{"typing":15}')
    expect(last).not.toMatch(/secret|passw/)
    // What was typed is in the box, and clicks reached it through the widget.
    await expect(box).toContainText('secret-passw0rd')

    // When the show is over it stops drawing: no frame loop and an empty canvas.
    await expect.poll(() => frame()!.evaluate(() => (window as unknown as { __flying: () => { raf: number } }).__flying().raf), { timeout: 20_000 }).toBe(0)
    expect(await frame()!.evaluate(() => (window as unknown as { __lit: () => number }).__lit())).toBe(0)
  } finally {
    await client?.close()
    await shutdown()
  }
})
