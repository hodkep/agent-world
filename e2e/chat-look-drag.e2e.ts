import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('the Keep and Undo bar can be dragged anywhere in the window, so it never hides what is under it; it stays put, can be put back, and can always be found', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-drag-'))
  const aw = join(home, 'aw')
  const { app, shutdown } = await launchApp({ AW_HOME: aw, AW_CLAUDE_PROJECTS: join(home, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1' }, home)
  let client: Client | undefined
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 900 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    const agentDir = join(aw, 'agents', readdirSync(join(aw, 'agents'))[0]!)
    const cfg = JSON.parse(readFileSync(join(agentDir, 'mcp.json'), 'utf8')).mcpServers['agent-world']
    client = new Client({ name: 'ada', version: '1' })
    await client.connect(new StreamableHTTPClientTransport(new URL(cfg.url), { requestInit: { headers: cfg.headers } }))
    await client.callTool({ name: 'chat_mod_get', arguments: {} })
    await client.callTool({ name: 'chat_mod_write', arguments: { addCss: ':root{--accent:#ff6600}', why: 'orange' } })
    const bar = page.getByRole('status', { name: 'A new look for the chat' })
    await expect(bar).toBeVisible()
    const box = async () => (await bar.boundingBox())!
    const win = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }))

    // The grip is only a handle: the words start right beside it, not half way along the bar.
    const grip = await bar.locator('.mod-grip').boundingBox()
    const words = await bar.locator(':scope > span:not(.mod-grip)').boundingBox()
    const whole = await bar.boundingBox()
    expect(grip!.width).toBeLessThan(30)
    expect(words!.x - (grip!.x + grip!.width)).toBeLessThan(30)
    expect(words!.width).toBeGreaterThan(whole!.width * 0.5)

    // At first it sits at the top, in the middle, over the top bar.
    const first = await box()
    expect(Math.abs(first.x + first.width / 2 - win.w / 2)).toBeLessThan(4)
    expect(first.y).toBeLessThan(20)
    const covered = await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.closest('.mod-bar') !== null, [first.x + 100, first.y + 20])
    expect(covered).toBe(true)

    // Drag it by its words to the lower middle of the window: it follows, and what it covered is free.
    await page.mouse.move(first.x + 120, first.y + 20)
    await page.mouse.down()
    await page.mouse.move(first.x + 220, first.y + 200, { steps: 6 })
    await page.mouse.move(first.x + 220, first.y + 560, { steps: 6 })
    await page.mouse.up()
    const moved = await box()
    expect(moved.y).toBeGreaterThan(first.y + 500)
    expect(Math.abs(moved.x - (first.x + 100))).toBeLessThan(6)
    expect(await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.closest('.mod-bar') === null, [first.x + 100, first.y + 20])).toBe(true)
    await page.screenshot({ path: join(__dirname, '..', 'test-results', 'bar-dragged.png') })

    // It is still a working bar: Compare, Keep and Undo take clicks, and pressing a button does not start a drag.
    await expect(bar.getByRole('button', { name: 'Keep' })).toBeVisible()
    const keepAt = await bar.getByRole('button', { name: 'Keep' }).boundingBox()
    expect(keepAt!.y).toBeGreaterThan(first.y + 500)

    // It stays where it was left, also after the window is reloaded.
    await page.reload()
    await expect(bar).toBeVisible()
    expect(Math.abs((await box()).y - moved.y)).toBeLessThan(3)

    // Dragged far outside the window, a handle of it stays in: it can always be found.
    const m = await box()
    await page.mouse.move(m.x + 120, m.y + 20)
    await page.mouse.down()
    await page.mouse.move(m.x + 120 + 6000, m.y + 20 + 6000, { steps: 4 })
    await page.mouse.up()
    const far = await box()
    expect(far.x).toBeLessThan(win.w - 60)
    expect(far.y).toBeLessThan(win.h - 20)

    // A double click puts it back where it began.
    await page.mouse.dblclick(far.x + 40, far.y + 30)
    const back = await box()
    expect(Math.abs(back.x - first.x)).toBeLessThan(3)
    expect(Math.abs(back.y - first.y)).toBeLessThan(3)

    // The keyboard moves it too: arrows from the grip, Home puts it back.
    await bar.getByRole('button', { name: /Move this bar/ }).focus()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    expect((await box()).y).toBeGreaterThanOrEqual(back.y + 20)
    await page.keyboard.press('Home')
    expect(Math.abs((await box()).y - first.y)).toBeLessThan(3)

    // Keep takes the draft and the bar goes.
    await bar.getByRole('button', { name: 'Keep' }).click()
    await expect(bar).toHaveCount(0)
  } finally {
    await client?.close()
    await shutdown()
  }
})
