import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

const say = (r: unknown) => (r as { content: { text: string }[] }).content[0]!.text

test('todos: fully tracked mode makes a task of each request, keeps the ones an agent named, closes them when the turn ends, drops a chat-only one, and shows what it costs', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-todos-track-'))
  const args = join(home, 'args.log')
  const { app, shutdown } = await launchApp(
    { AW_HOME: join(home, 'aw'), AW_USER_HOME: join(home, 'user'), AW_CLAUDE_PROJECTS: join(home, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_ARGS: args, FAKE_DELAY_MS: '100', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_USAGE: '{"title": "Fix the Safari login bug", "list": "Library"}' },
    home
  )
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 900 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()

    // The choice is in Settings with its price, off by default.
    await page.locator('header').getByRole('button', { name: 'Settings', exact: true }).click()
    const settings = page.getByRole('dialog', { name: 'Settings' })
    await settings.getByRole('tab', { name: /Features/ }).click()
    const sw = settings.getByRole('checkbox', { name: /Track every request as a todo/ })
    await expect(sw).not.toBeChecked()
    await expect(settings.getByLabel('What fully tracked todos add, on these assumptions')).toContainText('A normal session')
    await sw.check()
    await expect(settings.getByLabel('What fully tracked todos add, on these assumptions')).toContainText('Every request you send also becomes a task')
    await settings.getByRole('button', { name: 'Close settings' }).click()

    // An agent started now is told about the board in its opening text; a message to it becomes a task it is on.
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const claudeLine = (): string[] => readFileSync(args, 'utf8').split('\n').filter((l) => l.startsWith('[')).map((l) => JSON.parse(l) as string[]).find((a) => a.includes('--mcp-config'))!
    await expect.poll(() => readFileSync(args, 'utf8').includes('--mcp-config')).toBe(true)
    expect(claudeLine()[claudeLine().indexOf('--append-system-prompt') + 1]).toContain('todo board')
    const box = page.getByRole('textbox', { name: 'Message ada' })
    await box.fill('please fix the login bug on Safari')
    await box.press('Enter')
    // The agent says what the work is and where it belongs, through the board's tools.
    const mcp = JSON.parse(readFileSync(claudeLine()[claudeLine().indexOf('--mcp-config') + 1]!, 'utf8')).mcpServers['agent-world'] as { url: string; headers: Record<string, string> }
    const client = new Client({ name: 'test', version: '1' })
    await client.connect(new StreamableHTTPClientTransport(new URL(mcp.url), { requestInit: { headers: mcp.headers } }))
    await expect.poll(async () => say(await client.callTool({ name: 'todo_list', arguments: {} }))).toContain('login bug on Safari')
    const id = /todo#(\d+)/.exec(say(await client.callTool({ name: 'todo_list', arguments: {} })))![1]!
    await client.callTool({ name: 'todo_update', arguments: { id, title: 'Fix the Safari login bug', list: 'Library' } })
    // The agent's turn ended on its own, so the request was answered: the app closes the task.
    await page.locator('header').getByRole('button', { name: /Todos/ }).click()
    const board = page.getByRole('dialog', { name: 'Todos' })
    const area = board.getByRole('listitem', { name: 'Library' })
    await expect(area).toBeVisible()
    await expect(board.getByRole('listitem', { name: 'Inbox' })).toHaveCount(0)
    await area.getByRole('button', { name: /Done \(1\)/ }).click()
    const done = area.getByRole('button', { name: 'Open Fix the Safari login bug' })
    await expect(done).toBeVisible()
    await expect(done).not.toContainText('unfinished')
    await done.click()
    const detail = board.getByRole('complementary', { name: 'Task detail' })
    await expect(detail).toContainText('Closed when its turn ended')
    // The words of the request are kept as where it came from.
    await expect(detail.getByLabel('Where it came from')).toContainText('please fix the login bug on Safari')

    // A request that was only talked about (nobody named it, nothing was changed) is dropped when the turn ends, so the board holds work only.
    await board.getByRole('button', { name: /^Close/ }).first().click().catch(() => undefined)
    await box.fill('why is this error shown in the preview tab for the project')
    await box.press('Enter')
    await expect.poll(async () => say(await client.callTool({ name: 'todo_list', arguments: { status: 'doing' } })), { timeout: 10_000 }).toContain('preview tab')
    // It is closed with its turn and, after a last look for changes, dropped.
    await expect.poll(async () => say(await client.callTool({ name: 'todo_list', arguments: { status: 'doing' } })) + say(await client.callTool({ name: 'todo_list', arguments: { status: 'done' } })), { timeout: 20_000 }).not.toContain('preview tab')
    await client.close()
  } finally {
    await shutdown()
  }
})
