import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'
import { readLog } from './readLog'

test('the library and playbook can be switched off: agents are offered nothing from it, and its icon and window say it is off, with a way to the switch', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-libswitch-'))
  const args = join(home, 'args.log')
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_ARGS: args, FAKE_DELAY_MS: '50', FAKE_CHAT: '1' }, home)
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 1000 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    const header = page.locator('header')
    await expect(header.getByRole('button', { name: 'Library', exact: true })).toBeVisible()

    // Switched off in Settings > Features: Check before acting goes grey under it.
    await header.getByRole('button', { name: 'Settings', exact: true }).click()
    const settings = page.getByRole('dialog', { name: 'Settings' })
    await settings.getByRole('tab', { name: /Features/ }).click()
    const lib = settings.getByRole('checkbox', { name: /Library and playbook/ })
    await expect(settings.getByRole('checkbox', { name: /Check before acting/ })).toHaveCount(0)
    await expect(lib).toBeChecked()
    await expect(settings.getByRole('table', { name: 'What the library and playbook add, on these assumptions' })).toContainText('tokens')
    await lib.click()
    await expect(lib).not.toBeChecked()
    await settings.getByRole('button', { name: 'Close settings' }).click()

    // An agent started now is offered no library tools.
    await hire(page)
    await expect.poll(() => readLog(args).includes('--mcp-config')).toBe(true)
    const line = readLog(args).split('\n').filter((l) => l.startsWith('[')).map((l) => JSON.parse(l) as string[]).find((a) => a.includes('--mcp-config'))!
    const mcp = JSON.parse(readFileSync(line[line.indexOf('--mcp-config') + 1]!, 'utf8')).mcpServers['agent-world'] as { url: string; headers: Record<string, string> }
    const tools = async () => {
      const c = new Client({ name: 'test', version: '1' })
      await c.connect(new StreamableHTTPClientTransport(new URL(mcp.url), { requestInit: { headers: mcp.headers } }))
      const names = (await c.listTools()).tools.map((t) => t.name)
      await c.close()
      return names
    }
    expect(await tools()).not.toContain('library_index')
    expect(await tools()).toContain('todo_list')

    // The icon is dimmed and says off; its window says so too, with a button to the switch.
    const icon = header.getByRole('button', { name: 'Library (off)' })
    await expect(icon).toBeVisible()
    await icon.click()
    const library = page.getByRole('dialog', { name: 'Library' })
    await expect(library.getByRole('note', { name: 'The library is off' })).toContainText('turned off')
    await expect(library.getByRole('tab', { name: 'Playbook' })).toHaveCount(0)
    await library.getByRole('button', { name: 'Open Settings → Features' }).click()
    await expect(page.getByRole('dialog', { name: 'Library' })).toHaveCount(0)
    const again = page.getByRole('dialog', { name: 'Settings' })
    await expect(again.getByRole('checkbox', { name: /Library and playbook/ })).not.toBeChecked()

    // Switched back on, it works as before: the tools are back and the window shows the library.
    await again.getByRole('checkbox', { name: /Library and playbook/ }).click()
    await again.getByRole('button', { name: 'Close settings' }).click()
    expect(await tools()).toContain('library_index')
    await header.getByRole('button', { name: 'Library', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Library' }).getByRole('tab', { name: 'Playbook' })).toBeVisible()
  } finally {
    await shutdown()
  }
})
