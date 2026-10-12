import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

const say = (r: unknown) => (r as { content: { text: string }[] }).content[0]!.text

test('todos: a board of lists the person and an agent both fill, with a finished task that opens the message it was finished in', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-todos-e2e-'))
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
    await hire(page)
    // The agent says something, so there is a message for a task to point at.
    await page.getByRole('tab', { name: 'Chat' }).click()
    const box = page.getByRole('textbox', { name: 'Message ada' })
    await box.fill('hello there')
    await box.press('Enter')
    const log = page.getByRole('log', { name: 'Conversation with ada' })
    await expect(log.locator('.msg.assistant').first()).toBeVisible()

    // The person makes a list and a task by hand.
    await page.locator('header').getByRole('button', { name: 'Todos', exact: true }).click()
    const board = page.getByRole('dialog', { name: 'Todos' })
    await board.getByRole('button', { name: '＋ New list' }).click()
    await board.getByLabel('New list name').fill('Manual setup')
    await board.getByLabel('New list name').press('Enter')
    await board.getByRole('button', { name: '＋ Add a task' }).click()
    await board.getByLabel('New task in Manual setup').fill('Add the Anthropic key')
    await board.getByLabel('New task in Manual setup').press('Enter')
    const mine = board.getByRole('button', { name: 'Open Add the Anthropic key' })
    await expect(mine).toContainText('you')
    await expect(mine).toContainText('created just now')
    await expect(mine).not.toContainText('updated')

    // The agent, through the office's tools, adds a task that needs the person: it shows at once, and the top bar counts it.
    const claudeLine = readFileSync(args, 'utf8').split('\n').filter((l) => l.startsWith('[')).map((l) => JSON.parse(l) as string[]).find((a) => a.includes('--mcp-config'))!
    const mcp = JSON.parse(readFileSync(claudeLine[claudeLine.indexOf('--mcp-config') + 1]!, 'utf8')).mcpServers['agent-world'] as { url: string; headers: Record<string, string> }
    const client = new Client({ name: 'test', version: '1' })
    await client.connect(new StreamableHTTPClientTransport(new URL(mcp.url), { requestInit: { headers: mcp.headers } }))
    expect(say(await client.callTool({ name: 'todo_add', arguments: { title: 'Log in to agy', list: 'Tools', needs_you: true } }))).toContain('Added todo 2 to Tools')
    const theirs = board.getByRole('button', { name: 'Open Log in to agy' })
    await expect(theirs).toContainText('ada · Claude')
    await expect(theirs).toContainText('needs you')
    await board.getByRole('button', { name: 'Close todos' }).click()
    await expect(page.locator('header').getByRole('button', { name: /Todos 1/ })).toBeVisible()

    // The person sees both with who made them; the agent sees the person's task too, and finishes its own.
    expect(say(await client.callTool({ name: 'todo_list', arguments: {} }))).toContain('Add the Anthropic key')
    expect(say(await client.callTool({ name: 'todo_done', arguments: { id: '2', note: 'logged in' } }))).toContain('Marked todo 2 done')
    await page.locator('header').getByRole('button', { name: /Todos/ }).click()
    await expect(board.getByRole('button', { name: 'Open Log in to agy' })).toHaveCount(0)
    await board.getByRole('button', { name: /Done \(1\)/ }).click()
    await board.getByRole('button', { name: 'Open Log in to agy' }).click()
    const detail = board.getByRole('complementary', { name: 'Task detail' })
    await expect(detail).toContainText('Done by')
    await expect(detail).toContainText('logged in')
    await expect(detail.getByLabel('History')).toContainText('done')

    // The message it was finished in opens in the chat and flashes.
    await detail.getByRole('button', { name: /Open the message it was finished in/ }).click()
    await expect(board).toHaveCount(0)
    await expect(log.locator('.msg.assistant.flash').first()).toBeVisible()

    // A task moves to another list by dragging, and the board survives a reload (it is in a file).
    await page.locator('header').getByRole('button', { name: /Todos/ }).click()
    await board.getByRole('button', { name: 'Open Add the Anthropic key' }).dragTo(board.getByRole('listitem', { name: 'Tools' }).locator('.td-body'))
    await expect(board.getByRole('listitem', { name: 'Tools' }).getByRole('button', { name: 'Open Add the Anthropic key' })).toBeVisible()
    await page.reload()
    await page.locator('header').getByRole('button', { name: /Todos/ }).click()
    await expect(page.getByRole('dialog', { name: 'Todos' }).getByRole('listitem', { name: 'Tools' }).getByRole('button', { name: 'Open Add the Anthropic key' })).toBeVisible()
    await client.close()
  } finally {
    await shutdown()
  }
})
