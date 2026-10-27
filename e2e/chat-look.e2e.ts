import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { chatMenu, hire, launchApp } from './launch'
import { SLOW } from './waits'

test('POC: an agent changes the chat look through its tools; it shows as a draft, only Keep makes it stay, the system look always comes back', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-lay-'))
  const aw = join(home, 'aw')
  const { app, shutdown } = await launchApp({ AW_HOME: aw, AW_CLAUDE_PROJECTS: join(home, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '100', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1' }, home)
  let client: Client | undefined
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const box = page.getByRole('textbox', { name: 'Message ada' })
    await box.fill('add a health check')
    await box.press('Enter')
    const log = page.getByRole('log', { name: 'Conversation with ada' })
    await expect(log.locator('.tc').first()).toBeVisible({ timeout: SLOW })
    await expect(log.locator('.msg.assistant strong')).toHaveText('health.ts')
    const tools = await log.locator('.tc').count()
    const dir = join(__dirname, '..', 'test-results')
    await page.screenshot({ path: join(dir, 'look-0-default.png') })

    // The agent's own connection to the app, as its program would make it.
    const agentDir = join(aw, 'agents', readdirSync(join(aw, 'agents'))[0]!)
    const cfg = JSON.parse(readFileSync(join(agentDir, 'mcp.json'), 'utf8')).mcpServers['agent-world']
    client = new Client({ name: 'ada', version: '1' })
    await client.connect(new StreamableHTTPClientTransport(new URL(cfg.url), { requestInit: { headers: cfg.headers } }))
    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const r = (await client!.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] }
      return { err: !!r.isError, text: r.content[0]!.text }
    }
    expect((await call('chat_mod_guide')).text).toContain('chat_mod_write')
    expect(JSON.parse((await call('chat_mod_get')).text).current.css).toBe('')

    // The agent can look at the app: find the office panel's class, and see the window.
    const outline = (await call('app_ui_outline', { depth: 3 })).text
    expect(outline).toContain('div.stage-wrap')
    expect(outline).toContain('div.stage')
    expect(outline).toContain('aside')
    expect((await call('app_ui_outline', { selector: '.stage-ctl', depth: 2 })).text).toContain('Fit office')
    const shot = (await client!.callTool({ name: 'app_ui_screenshot', arguments: {} })) as { content: { type: string; data: string }[] }
    expect(shot.content[0]!.type).toBe('image')
    expect(Buffer.from(shot.content[0]!.data, 'base64').subarray(1, 4).toString()).toBe('PNG')

    // A refused write changes nothing on screen.
    const bad = await call('chat_mod_write', { css: '@import url(https://x.y/a.css);', why: 'x' })
    expect(bad.err).toBe(true)
    await expect(page.getByRole('status', { name: 'A new look for the chat' })).toHaveCount(0)

    // A real write: it shows at once, with Keep and Undo, and the look is applied.
    const ok = await call('chat_mod_write', {
      layout: [{ match: { kind: ['thinking'] }, place: 'hidden' }, { match: { kind: ['tool'] }, place: 'footer', group: 'Work', label: 'work', icon: '🛠' }],
      css: ':root { --accent: #ff6600 } .msg.assistant { border-left: 4px solid var(--accent); padding-left: 10px } .composer { display: none } .mod-bar { display: none }',
      why: 'orange, tool calls under the reply'
    })
    expect(ok.err).toBe(false)
    const bar = page.getByRole('status', { name: 'A new look for the chat' })
    await expect(bar).toContainText('ada changed how the chat looks: orange, tool calls under the reply')
    await expect(log.locator('[data-pack="work"] .lay-chip b')).toHaveText(String(tools))
    await expect(log.locator('.msg.assistant')).toHaveCSS('border-left-width', '4px')
    // The CSS tried to hide the message box and the bar itself: neither goes.
    await expect(page.locator('.composer')).toBeVisible()
    await expect(bar).toBeVisible()
    await page.screenshot({ path: join(dir, 'look-1-draft.png') })

    // Compare: held, the window shows the look in force; let go, the new one is back. The bar stays either way.
    const eye = bar.getByRole('button', { name: 'Hold to compare with the current look' })
    await eye.hover()
    await page.mouse.down()
    await expect(log.locator('[data-pack]')).toHaveCount(0)
    await expect(log.locator('.tc')).toHaveCount(tools)
    await expect(log.locator('.msg.assistant')).toHaveCSS('border-left-width', '0px')
    await expect(bar).toContainText('Showing the current look')
    await page.screenshot({ path: join(dir, 'look-1b-compare-held.png') })
    await page.mouse.up()
    await expect(log.locator('[data-pack="work"]')).toBeVisible()
    await expect(log.locator('.msg.assistant')).toHaveCSS('border-left-width', '4px')
    await expect(bar).toContainText('orange, tool calls under the reply')
    // The keyboard does the same: Space holds, letting go releases.
    await eye.focus()
    await page.keyboard.down('Space')
    await expect(log.locator('[data-pack]')).toHaveCount(0)
    await page.keyboard.up('Space')
    await expect(log.locator('[data-pack="work"]')).toBeVisible()

    // Undo: back to the system look, nothing kept.
    await bar.getByRole('button', { name: 'Undo' }).click()
    await expect(bar).toHaveCount(0)
    await expect(log.locator('.tc')).toHaveCount(tools)
    await expect(log.locator('[data-pack]')).toHaveCount(0)

    // Write again and Keep: it stays, also after the window is reloaded.
    await call('chat_mod_write', { css: '.msg.assistant { border-left: 4px solid #ff6600 }', layout: [{ match: { kind: ['tool'] }, place: 'badge', label: 'steps' }], why: 'a count' })
    await bar.getByRole('button', { name: 'Keep' }).click()
    await expect(bar).toHaveCount(0)
    await expect(log.locator('[data-pack="steps"]')).toBeVisible()
    await page.reload()
    await page.getByRole('tab', { name: 'Chat' }).click()
    await expect(page.getByRole('log', { name: 'Conversation with ada' }).locator('[data-pack="steps"]')).toBeVisible({ timeout: SLOW })
    await page.screenshot({ path: join(dir, 'look-2-kept.png') })

    // The agent asks for the system look: a draft the person sees too.
    await call('chat_mod_write', { reset: true, why: 'back to normal' })
    await expect(bar).toContainText('back to normal')
    await bar.getByRole('button', { name: 'Keep' }).click()
    await expect(log.locator('.tc')).toHaveCount(tools)

    // And the person can always do it alone, with no agent: bring the kept look back, then restore the system look.
    await chatMenu(page, 'Previous look')
    await expect(log.locator('[data-pack="steps"]')).toBeVisible()
    await chatMenu(page, 'Restore system look')
    await expect(log.locator('.tc')).toHaveCount(tools)
    await expect(log.locator('[data-pack]')).toHaveCount(0)
    await expect(log.locator('.msg.assistant')).toHaveCSS('border-left-width', '0px')
  } finally {
    await client?.close()
    await shutdown()
  }
})
