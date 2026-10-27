import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'
import { SLOW } from './waits'

const DRACULA = ':root{--bg:#21222c;--panel:#282a36;--panel-2:#343746;--panel-3:#21222c;--panel-hover:#3d4052;--line:#44475a;--ink:#191a21;--text:#f8f8f2;--muted:#a8aed3;--dim:#44475a;--accent:#bd93f9;--accent-hot:#caa9fa;--accent-dim:#6b5a96;--danger:#ff5555;--danger-hot:#ff6e6e;--danger-text:#ff7b7b;--danger-well:#3a2030;--ok:#50fa7b;--ok-text:#50fa7b;--think:#8be9fd;--violet:#ff79c6;--well:#1e1f29;--selected:#44475a;--wood:#44475a}'

test('a Dracula theme: the old mistake is refused with the reason, the right one is applied to the app UI', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-theme-'))
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
    const agentDir = join(aw, 'agents', readdirSync(join(aw, 'agents'))[0]!)
    const cfg = JSON.parse(readFileSync(join(agentDir, 'mcp.json'), 'utf8')).mcpServers['agent-world']
    client = new Client({ name: 'ada', version: '1' })
    await client.connect(new StreamableHTTPClientTransport(new URL(cfg.url), { requestInit: { headers: cfg.headers } }))
    const write = async (css: string) => {
      await client!.callTool({ name: 'chat_mod_get', arguments: {} })
      const r = (await client!.callTool({ name: 'chat_mod_write', arguments: { css, why: 'theme' } })) as { isError?: boolean; content: { text: string }[] }
      return { err: !!r.isError, text: r.content[0]!.text }
    }
    const dir = join(__dirname, '..', 'test-results')
    // What the agent wrote last time: a light --ink. It is refused, with the reason.
    const bad = await write(':root{--bg:#2b2b2b;--panel:#3c3f41;--ink:#bbbbbb;--text:#a9b7c6}')
    expect(bad.err).toBe(true)
    expect(bad.text).toMatch(/--ink.*darker than --panel/)
    // The right one is applied; the borders stay dark.
    expect((await write(DRACULA)).err).toBe(false)
    await expect(page.getByRole('status', { name: 'A new look for the chat' })).toBeVisible()
    await expect(page.locator('aside')).toHaveCSS('background-color', 'rgb(40, 42, 54)')
    await page.screenshot({ path: join(dir, 'theme-dracula.png') })
  } finally {
    await client?.close()
    await shutdown()
  }
})
