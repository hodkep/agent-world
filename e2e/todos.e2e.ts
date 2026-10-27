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
    expect(say(await client.callTool({ name: 'todo_add', arguments: { title: 'Log in to agy', list: 'Tools', needs_you: true } }))).toContain('Added todo#2 to Tools')
    const theirs = board.getByRole('button', { name: 'Open Log in to agy' })
    await expect(theirs).toContainText('ada · Claude')
    await expect(theirs).toContainText('needs you')
    await board.getByRole('button', { name: 'Close todos' }).click()
    await expect(page.locator('header').getByRole('button', { name: /Todos 1/ })).toBeVisible()

    // The person sees both with who made them; the agent sees the person's task too, and finishes its own.
    expect(say(await client.callTool({ name: 'todo_list', arguments: {} }))).toContain('Add the Anthropic key')
    expect(say(await client.callTool({ name: 'todo_done', arguments: { id: '2', note: 'logged in', how: 'Opened the agy terminal and signed in with the browser flow.', files: ['docs/agy-login.md'] } }))).toContain('Marked todo#2 done')
    // The finished task is a knowledge base entry: found by words, and written to the shared memory where `recall` finds it.
    expect(say(await client.callTool({ name: 'todo_search', arguments: { query: 'agy browser sign' } }))).toContain('todo#2')
    await expect.poll(async () => say(await client.callTool({ name: 'recall', arguments: { query: 'agy browser' } }))).toContain('todo#2')
    // A new request that looks like that finished work gets a line pointing at it, once.
    const hook = JSON.parse(readFileSync(claudeLine[claudeLine.indexOf('--settings') + 1]!, 'utf8')).hooks.UserPromptSubmit[0].hooks[0] as { url: string; headers: Record<string, string> }
    const ask = async (prompt: string) => (await (await fetch(hook.url, { method: 'POST', headers: { ...hook.headers, 'content-type': 'application/json' }, body: JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: claudeLine[claudeLine.indexOf('--session-id') + 1], prompt }) })).text()) || ''
    expect(await ask('please log in to agy with the browser flow again')).toContain('Done before: todo#2')
    expect(await ask('please log in to agy with the browser flow again')).not.toContain('Done before')
    await page.locator('header').getByRole('button', { name: /Todos/ }).click()
    await expect(board.getByRole('button', { name: 'Open Log in to agy' })).toHaveCount(0)
    // Its list has nothing open now, so it is a small tile until it is opened.
    await board.getByRole('button', { name: 'Open Tools' }).click()
    await board.getByRole('button', { name: /Done \(1\)/ }).click()
    await board.getByRole('button', { name: 'Open Log in to agy' }).click()
    const detail = board.getByRole('complementary', { name: 'Task detail' })
    await expect(detail).toContainText('Done by')
    await expect(detail).toContainText('logged in')
    await detail.getByRole('tab', { name: 'How' }).click()
    await expect(detail.getByRole('tabpanel')).toContainText('signed in with the browser flow')
    await expect(detail.getByLabel('Files')).toContainText('docs/agy-login.md')
    await detail.getByRole('tab', { name: /^Activity/ }).click()
    await expect(detail.getByRole('tabpanel')).toContainText('Done by ada')
    await expect(detail.getByRole('tabpanel')).not.toContainText('updated by')
    await detail.getByRole('tab', { name: 'Overview' }).click()

    // The message it was finished in opens in the chat and flashes.
    await detail.getByRole('button', { name: /Open the message it was finished in/ }).click()
    await expect(board).toHaveCount(0)
    await expect(log.locator('.msg.assistant.flash').first()).toBeVisible()

    // A task moves to another list by dragging, and the board survives a reload (it is in a file).
    await page.locator('header').getByRole('button', { name: /Todos/ }).click()
    // Deleting a list asks inside the app, and Cancel keeps everything.
    await board.getByRole('button', { name: 'Menu for Manual setup' }).click()
    await board.getByRole('menuitem', { name: 'Delete list' }).click()
    const sure = page.getByRole('dialog', { name: /Delete Manual setup and its 1 task\?/ })
    await expect(sure).toBeVisible()
    await sure.getByRole('button', { name: 'Cancel' }).click()
    await expect(sure).toHaveCount(0)
    await expect(board.getByRole('listitem', { name: 'Manual setup' })).toBeVisible()

    // Any agent can be asked about a task, or put on it, from its detail; the agent gets a message that names the task and the chat opens.
    await board.getByRole('button', { name: 'Open Add the Anthropic key' }).click()
    const panel = board.getByRole('complementary', { name: 'Task detail' })
    await panel.getByRole('tab', { name: 'Ask', exact: true }).click()
    await expect(panel.getByLabel('Agent to ask')).toContainText('ada · Claude')
    await panel.getByRole('button', { name: 'Work on it' }).click()
    await panel.getByLabel('What to say').fill('Start with the Settings page.')
    await panel.getByRole('button', { name: 'Send to ada' }).click()
    await expect(board).toHaveCount(0)
    await expect(log.locator('.msg.user').last()).toContainText('todo#1')
    await expect(log.locator('.msg.user').last()).toContainText('Start with the Settings page.')
    // The task is named todo#1 in that message and is a link: a click opens the board on it.
    const chip = log.locator('.msg.user').last().locator('.todo-ref')
    await expect(chip).toContainText('todo#1')
    await expect(chip).toContainText('Add the Anthropic key')
    await chip.click()
    await expect(board.getByRole('complementary', { name: 'Task detail' }).getByLabel('Task title')).toHaveValue('Add the Anthropic key')
    await board.getByRole('button', { name: 'Close todos' }).click()
    await page.locator('header').getByRole('button', { name: /Todos/ }).click()
    await expect(board.getByRole('listitem', { name: 'Manual setup' }).getByRole('button', { name: 'Open Add the Anthropic key' })).toContainText('doing · ada')


    await board.getByRole('button', { name: 'Open Add the Anthropic key' }).dragTo(board.getByRole('listitem', { name: 'Tools' }))
    await expect(board.getByRole('listitem', { name: 'Tools' }).getByRole('button', { name: 'Open Add the Anthropic key' })).toBeVisible()
    await page.reload()
    await page.locator('header').getByRole('button', { name: /Todos/ }).click()
    await expect(page.getByRole('dialog', { name: 'Todos' }).getByRole('listitem', { name: 'Tools' }).getByRole('button', { name: 'Open Add the Anthropic key' })).toBeVisible()
    await client.close()
  } finally {
    await shutdown()
  }
})
