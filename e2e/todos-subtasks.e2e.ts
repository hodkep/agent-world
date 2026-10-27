import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('todos: subtasks sit in a checklist on their umbrella card, labels are made, picked, filtered and managed, and the task view is in tabs', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-todos-sub-'))
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
    const claudeLine = readFileSync(args, 'utf8').split('\n').filter((l) => l.startsWith('[')).map((l) => JSON.parse(l) as string[]).find((a) => a.includes('--mcp-config'))!
    const mcp = JSON.parse(readFileSync(claudeLine[claudeLine.indexOf('--mcp-config') + 1]!, 'utf8')).mcpServers['agent-world'] as { url: string; headers: Record<string, string> }
    const client = new Client({ name: 'test', version: '1' })
    await client.connect(new StreamableHTTPClientTransport(new URL(mcp.url), { requestInit: { headers: mcp.headers } }))
    const call = (name: string, a: Record<string, unknown>) => client.callTool({ name, arguments: a })

    // An agent makes an umbrella, and two parts under it, one with labels.
    await call('todo_add', { title: 'Diagrams in chat', list: 'Chat' })
    await call('todo_add', { title: 'Pick boxes', parent: '1', labels: ['chat'] })
    await call('todo_add', { title: 'Zoom the draw view', parent: '1' })
    await page.locator('header').getByRole('button', { name: /Todos/ }).click()
    const board = page.getByRole('dialog', { name: 'Todos' })

    // The parts are in the umbrella's card, not cards of their own, with how far it has got.
    const list = board.getByRole('listitem', { name: 'Chat' })
    const card = list.locator('.td-task')
    await expect(card).toHaveCount(1)
    const parts = card.getByLabel('Subtasks of Diagrams in chat')
    await expect(parts).toContainText('0 of 2 done')
    await parts.getByRole('checkbox', { name: 'Finish Pick boxes' }).click()
    await expect(parts).toContainText('1 of 2 done')

    if (process.env.SHOT) await board.screenshot({ path: `${process.env.SHOT}-board.png` })
    // A click on a part opens it, saying whose part it is; the last part done finishes the umbrella.
    await parts.getByRole('button', { name: 'Open Zoom the draw view' }).click()
    const detail = board.getByRole('complementary', { name: 'Task detail' })
    await expect(detail.getByLabel('Task title')).toHaveValue('Zoom the draw view')
    await expect(detail).toContainText('part of')
    await detail.getByRole('button', { name: 'Mark done' }).click()
    await expect(list.getByRole('button', { name: /Done \(1\)/ })).toBeVisible()

    // The umbrella opens on its Subtasks tab, and a subtask is added there.
    await list.getByRole('button', { name: /Done \(1\)/ }).click()
    await list.getByRole('button', { name: 'Open Diagrams in chat' }).click()
    await detail.getByRole('tab', { name: /^Subtasks 2/ }).click()
    await detail.getByLabel('Add a subtask').fill('Sequence diagrams')
    await detail.getByLabel('Add a subtask').press('Enter')
    await expect(detail.getByRole('tab', { name: /^Subtasks 3/ })).toBeVisible()
    // A new part reopens the finished umbrella.
    await expect(detail.getByRole('button', { name: 'Mark done' })).toBeVisible()

    if (process.env.SHOT) await board.screenshot({ path: `${process.env.SHOT}-detail.png` })
    // A label is made from the task, shows on its card, filters the board, and is renamed, recoloured and removed from the manager.
    await detail.getByRole('tab', { name: 'Overview' }).click()
    await detail.getByRole('button', { name: '+ label' }).click()
    await detail.getByLabel('New label').fill('release')
    await detail.getByLabel('New label').press('Enter')
    await expect(card.first()).toContainText('release')
    // One Label button in the filter bar: it picks a label to filter by, and opens the manager.
    await board.getByRole('button', { name: /^Label/ }).click()
    await board.getByRole('menuitem', { name: 'Manage labels…' }).click()
    const mgr = board.getByRole('dialog', { name: 'Manage labels' })
    await mgr.getByLabel('Name of release').fill('shipping')
    await mgr.getByLabel('Name of release').press('Enter')
    await expect(card.first()).toContainText('shipping')
    if (process.env.SHOT) await board.screenshot({ path: `${process.env.SHOT}-labels.png` })
    // A colour is picked from a grid of presets, or typed as #rrggbb, and a click outside closes the picker.
    await mgr.getByRole('button', { name: 'Colour of shipping' }).click()
    const grid = mgr.getByRole('dialog', { name: 'Colours for shipping' })
    if (process.env.SHOT) await board.screenshot({ path: `${process.env.SHOT}-picker.png` })
    await grid.getByRole('radio', { name: '#d83a3a' }).click()
    await expect(grid).toHaveCount(0)
    await mgr.getByRole('button', { name: 'Colour of shipping' }).click()
    await expect(grid.getByRole('radio', { name: '#d83a3a' })).toHaveAttribute('aria-checked', 'true')
    await grid.getByLabel('Colour as #rrggbb').fill('#123abc')
    await grid.getByLabel('Colour as #rrggbb').press('Enter')
    await mgr.getByRole('button', { name: 'Colour of shipping' }).click()
    await expect(grid.getByLabel('Colour as #rrggbb')).toHaveValue('#123abc')
    await mgr.getByText('Manage labels', { exact: true }).click()
    await expect(grid).toHaveCount(0)
    await mgr.getByLabel('New label name').fill('later')
    await mgr.getByLabel('New label name').press('Enter')
    await expect(mgr.getByLabel('Name of later')).toBeVisible()
    // Clicking outside the manager closes it.
    await board.getByText('Todos', { exact: true }).first().click()
    await expect(mgr).toHaveCount(0)
    // Filter: the label's tasks only, and Any label shows all again.
    await board.getByRole('button', { name: /^Label/ }).click()
    await board.getByRole('menuitemradio', { name: /shipping/ }).click()
    await expect(list.locator('.td-task')).toHaveCount(1)
    await board.getByRole('button', { name: 'shipping ▾' }).click()
    await board.getByRole('menuitemradio', { name: /later/ }).click()
    await expect(list.locator('.td-task')).toHaveCount(0)
    await board.getByRole('button', { name: 'later ▾' }).click()
    await board.getByRole('menuitemradio', { name: 'Any label' }).click()
    await expect(list.locator('.td-task')).toHaveCount(1)
    // Removing a label asks, in a small box.
    await board.getByRole('button', { name: /^Label/ }).click()
    await board.getByRole('menuitem', { name: 'Manage labels…' }).click()
    await mgr.getByRole('button', { name: 'Remove later' }).click()
    const sure = page.getByRole('dialog', { name: /Remove the label/ })
    expect((await sure.boundingBox())!.height).toBeLessThan(260)
    await sure.getByRole('button', { name: 'Remove', exact: true }).click()
    await expect(mgr.getByLabel('Name of later')).toHaveCount(0)
    await client.close()
  } finally {
    await shutdown()
  }
})
