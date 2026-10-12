import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

const say = (r: unknown) => (r as { content: { text: string }[] }).content[0]!.text

test('todos: fully tracked mode makes a task of each request, flags it when the turn ends unfinished, and shows what it costs', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-todos-track-'))
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

    // The choice is in Settings with its price, off by default.
    await page.locator('header').getByRole('button', { name: 'Settings', exact: true }).click()
    const settings = page.getByRole('dialog', { name: 'Settings' })
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
    await page.locator('header').getByRole('button', { name: /Todos/ }).click()
    const board = page.getByRole('dialog', { name: 'Todos' })
    const task = board.getByRole('listitem', { name: 'Requests' }).getByRole('button', { name: 'Open please fix the login bug on Safari' })
    await expect(task).toBeVisible()
    await expect(task).toContainText('you')
    // Its turn ended and the agent never said done: the board says so rather than showing work in hand.
    await expect(task).toContainText('unfinished')

    // The agent finishes it through the tool the reminder named; the flag goes.
    const mcp = JSON.parse(readFileSync(claudeLine()[claudeLine().indexOf('--mcp-config') + 1]!, 'utf8')).mcpServers['agent-world'] as { url: string; headers: Record<string, string> }
    const client = new Client({ name: 'test', version: '1' })
    await client.connect(new StreamableHTTPClientTransport(new URL(mcp.url), { requestInit: { headers: mcp.headers } }))
    expect(say(await client.callTool({ name: 'todo_done', arguments: { id: '1', note: 'fixed the Safari cookie' } }))).toContain('Marked todo#1 done')
    await expect(task).toHaveCount(0)
    await board.getByRole('button', { name: /Done \(1\)/ }).click()
    await expect(board.getByRole('button', { name: 'Open please fix the login bug on Safari' })).not.toContainText('unfinished')
    await client.close()
  } finally {
    await shutdown()
  }
})
