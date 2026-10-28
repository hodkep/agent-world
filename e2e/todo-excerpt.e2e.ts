import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'
import { SLOW } from './waits'

const say = (r: unknown) => (r as { content: { text: string }[] }).content[0]!.text

// A long request: a line, a path, a table wider than the task panel, two more paragraphs, then one so long the kept excerpt stops before it (five blocks kept, the last ending in …).
const MESSAGE = [
  'Design options for Settings > Updates are in a local HTML file. Nothing is built yet.',
  '`/private/tmp/claude-501/scratchpad/updates-beta-options.html`',
  '| Option | What it is | Where the choice lives | Mock |\n| --- | --- | --- | --- |\n| A: two channel rows (recommended) | Stable and Beta each get their own row with a radio | Settings > Updates | `/private/tmp/claude-501/scratchpad/updates-beta-options.html` |\n| B: one switch | One "Try beta builds" switch under the version | Settings > Updates |\n| C: ask at update time | The update chip offers the beta when one is newer | Update popover |',
  'Each option keeps the current version line and the Check now button. A says which channel is on in the popover too.',
  'Pick one and I build it test first, one PR, targeted tests only. Say the letter.',
  'The long tail of the message, which the task keeps no part of. '.repeat(70)
].join('\n\n')

test('todos: a long message a task came from is folded on whole blocks with a count, opens to its full height, scrolls a wide table sideways, and says when the rest is only in the message', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-todo-excerpt-'))
  const args = join(home, 'args.log')
  const { app, shutdown } = await launchApp(
    { AW_HOME: join(home, 'aw'), AW_USER_HOME: join(home, 'user'), AW_CLAUDE_PROJECTS: join(home, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_ARGS: args, FAKE_DELAY_MS: '100', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1' },
    home
  )
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 900 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await page.locator('header').getByRole('button', { name: 'Settings', exact: true }).click()
    const settings = page.getByRole('dialog', { name: 'Settings' })
    await settings.getByRole('tab', { name: /Features/ }).click()
    await settings.getByRole('checkbox', { name: /Track every request as a todo/ }).check()
    await settings.getByRole('button', { name: 'Close settings' }).click()

    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const claudeLine = (): string[] => readFileSync(args, 'utf8').split('\n').filter((l) => l.startsWith('[')).map((l) => JSON.parse(l) as string[]).find((a) => a.includes('--mcp-config'))!
    await expect.poll(() => readFileSync(args, 'utf8').includes('--mcp-config')).toBe(true)
    const box = page.getByRole('textbox', { name: 'Message ada' })
    await box.fill(MESSAGE)
    await box.press('Enter')
    // The agent names the task, so the board keeps it when the turn ends.
    const mcp = JSON.parse(readFileSync(claudeLine()[claudeLine().indexOf('--mcp-config') + 1]!, 'utf8')).mcpServers['agent-world'] as { url: string; headers: Record<string, string> }
    const client = new Client({ name: 'test', version: '1' })
    await client.connect(new StreamableHTTPClientTransport(new URL(mcp.url), { requestInit: { headers: mcp.headers } }))
    await expect.poll(async () => say(await client.callTool({ name: 'todo_list', arguments: {} }))).toContain('Design options')
    const id = /todo#(\d+)/.exec(say(await client.callTool({ name: 'todo_list', arguments: {} })))![1]!
    await client.callTool({ name: 'todo_update', arguments: { id, title: 'Build the Updates channel choice', list: 'Settings' } })
    await client.close()

    await page.locator('header').getByRole('button', { name: /Todos/ }).click()
    const board = page.getByRole('dialog', { name: 'Todos' })
    const area = board.getByRole('listitem', { name: 'Settings' })
    await area.getByRole('button', { name: /Done \(1\)/ }).click({ timeout: SLOW })
    await area.getByRole('button', { name: 'Open Build the Updates channel choice' }).click()
    const source = board.getByRole('complementary', { name: 'Task detail' }).getByLabel('Where it came from')
    const quote = source.locator('.td-quote')
    const blocks = quote.locator('.md > *')

    // Folded: the first three blocks whole (the line, the path, the table), the rest hidden, and the link counts them.
    await expect(blocks).toHaveCount(5)
    await expect(blocks.nth(2)).toBeVisible()
    await expect(blocks.nth(2).locator('table')).toBeVisible()
    await expect(blocks.nth(3)).toBeHidden()
    await expect(blocks.nth(4)).toBeHidden()
    expect(await quote.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true)
    const more = source.getByRole('button', { name: /Show the rest/ })
    await expect(more).toContainText('2 more')
    // The kept excerpt stopped before the long tail, with … on a line of the last block: the panel says so, by the way to the whole message.
    await expect(blocks.nth(4)).toHaveText(/…$/)
    await expect(source.getByText('The rest is in the message')).toBeVisible()
    await expect(source.getByRole('button', { name: /^Open the message it was made in/ })).toBeVisible()
    if (process.env.SHOT) await board.screenshot({ path: `${process.env.SHOT}-folded.png` })

    // Open: every block shows at full height, with no scroll box of its own inside the panel.
    await more.click()
    await expect(blocks.nth(4)).toBeVisible()
    await blocks.nth(4).scrollIntoViewIfNeeded()
    await expect(blocks.nth(4)).toBeInViewport()
    expect(await quote.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true)
    // The table is wider than the panel: it scrolls sideways in its own box, and the panel is not clipped.
    const table = quote.locator('table')
    expect(await table.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
    expect(await table.evaluate((el) => ((el.scrollLeft = 9999), el.scrollLeft > 0))).toBe(true)
    expect(await quote.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
    if (process.env.SHOT) await board.screenshot({ path: `${process.env.SHOT}-open.png` })
    await source.getByRole('button', { name: 'Show less' }).click()
    await expect(blocks.nth(3)).toBeHidden()
  } finally {
    await shutdown()
  }
})
