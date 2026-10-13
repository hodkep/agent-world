import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp } from './launch'

test('todos: lists with an open task come first in a grid, the others are small tiles that open on a click, and a list does not move while it is being used', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-todos-grid-'))
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_USER_HOME: join(home, 'user'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '100' }, home)
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 900 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    // Lists in this order: Quiet (only a finished task), Alpha (open), Beta (open), Empty.
    await page.evaluate(async (f) => {
      await window.aw.todos.add(f, { title: 'old one', list: 'Quiet' })
      await window.aw.todos.add(f, { title: 'a1', list: 'Alpha' })
      await window.aw.todos.add(f, { title: 'b1', list: 'Beta' })
      await window.aw.todos.addList(f, 'Empty')
      const b = (await window.aw.todos.get(f)).board
      await window.aw.todos.done(f, b.todos.find((t) => t.title === 'old one')!.id)
    }, home)
    await page.locator('header').getByRole('button', { name: 'Todos', exact: true }).click()
    const board = page.getByRole('dialog', { name: 'Todos' })
    const names = () => board.getByRole('list', { name: 'Todo lists' }).getByRole('listitem').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
    // The lists with something open first, in the board's order, then the quiet ones.
    await expect.poll(names).toEqual(['Alpha', 'Beta', 'Quiet', 'Empty'])
    await expect(board.getByText('Nothing open · 2')).toBeVisible()

    // A quiet list is a tile with how many are done; a click opens it as a list.
    const tile = board.getByRole('listitem', { name: 'Quiet' })
    await expect(tile).toContainText('1 done')
    await expect(tile.getByRole('button', { name: '＋ Add a task' })).toHaveCount(0)
    await tile.getByRole('button', { name: 'Open Quiet' }).click()
    await expect(board.getByRole('listitem', { name: 'Quiet' }).getByRole('button', { name: '＋ Add a task' })).toBeVisible()
    await expect(board.getByRole('listitem', { name: 'Empty' })).toContainText('empty')

    // Finishing the last open task of a list does not move it while the window is in use...
    await board.getByRole('listitem', { name: 'Alpha' }).getByRole('checkbox', { name: 'Finish a1' }).click()
    await expect(board.getByRole('listitem', { name: 'Alpha' }).getByRole('button', { name: /Done \(1\)/ })).toBeVisible()
    expect(await names()).toEqual(['Alpha', 'Beta', 'Quiet', 'Empty'])
    // ...and it goes down with the quiet ones when the window is filtered or opened again.
    await board.getByRole('button', { name: 'Made by you' }).click()
    await expect.poll(names).toEqual(['Beta', 'Quiet', 'Alpha', 'Empty'])

    // A task added to a quiet list makes it active at once.
    await board.getByRole('listitem', { name: 'Empty' }).getByRole('button', { name: 'Open Empty' }).click()
    await board.getByRole('listitem', { name: 'Empty' }).getByRole('button', { name: '＋ Add a task' }).click()
    await board.getByLabel('New task in Empty').fill('now something')
    await board.getByLabel('New task in Empty').press('Enter')
    await expect.poll(names).toEqual(['Beta', 'Empty', 'Quiet', 'Alpha'])
    if (process.env.SHOT) await board.screenshot({ path: `${process.env.SHOT}-grid.png` })
  } finally {
    await shutdown()
  }
})
