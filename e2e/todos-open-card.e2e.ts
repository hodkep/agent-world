import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp } from './launch'

test('todos: the task whose panel is open is marked in its list and brought into view, out of a folded Done section or a quiet tile', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-todos-open-card-'))
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_USER_HOME: join(home, 'user'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '100' }, home)
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 700 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    // Alpha: a finished task and enough open ones that the column scrolls. Quiet: only a finished task, so it is a tile.
    const ids = await page.evaluate(async (f) => {
      await window.aw.todos.add(f, { title: 'finished one', list: 'Alpha' })
      for (let n = 1; n <= 30; n++) await window.aw.todos.add(f, { title: `task ${n}`, list: 'Alpha' })
      await window.aw.todos.add(f, { title: 'old one', list: 'Quiet' })
      const b = (await window.aw.todos.get(f)).board
      const id = (title: string) => b.todos.find((t) => t.title === title)!.id
      await window.aw.todos.done(f, id('finished one'))
      await window.aw.todos.done(f, id('old one'))
      return { fin: id('finished one'), last: id('task 30'), old: id('old one') }
    }, home)
    const open = (id: string) => page.evaluate((i) => window.dispatchEvent(new CustomEvent('aw-open-todo', { detail: i })), id)
    const board = page.getByRole('dialog', { name: 'Todos' })
    const card = (title: string) => board.locator('.td-task', { has: page.getByRole('button', { name: `Open ${title}`, exact: true }) })

    // A link to the last task: the column scrolls to it, and its card carries the mark (the title in the accent colour).
    await open(ids.last)
    await expect(board).toBeVisible()
    await expect(card('task 30')).toBeInViewport()
    await expect(card('task 30')).toHaveClass(/sel/)
    await expect(card('task 30').locator('.td-title')).toHaveCSS('color', 'rgb(242, 194, 48)')
    await expect(card('task 1').locator('.td-title')).not.toHaveCSS('color', 'rgb(242, 194, 48)')

    // A finished task: its list's Done section unfolds and the card is in view.
    await open(ids.fin)
    await expect(board.getByRole('listitem', { name: 'Alpha' }).getByRole('button', { name: /Done \(1\)/ })).toHaveAttribute('aria-expanded', 'true')
    await expect(card('finished one')).toBeInViewport()
    await expect(card('finished one')).toHaveClass(/sel/)

    // A task in a quiet list: the tile opens as a list and the card is in view.
    await open(ids.old)
    await expect(card('old one')).toBeInViewport()
    await expect(card('old one')).toHaveClass(/sel/)
  } finally {
    await shutdown()
  }
})
