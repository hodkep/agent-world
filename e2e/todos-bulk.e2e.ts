import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp } from './launch'

async function open() {
  const home = mkdtempSync(join(tmpdir(), 'aw-todos-bulk-'))
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_USER_HOME: join(home, 'user'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '100' }, home)
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1400, height: 900 })
  await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
  await page.reload()
  return { page, shutdown, home }
}

test('todos: pick tasks with a box that shows on hover, a range with Shift, a whole list with its own box, then act on them together', async () => {
  const { page, shutdown, home } = await open()
  try {
    await page.evaluate(async (f) => {
      for (const [title, list] of [['alpha', 'Library'], ['bravo', 'Library'], ['charlie', 'Library'], ['delta', 'Library'], ['echo', 'Chat']] as const) await window.aw.todos.add(f, { title, list })
    }, home)
    await page.locator('header').getByRole('button', { name: 'Todos', exact: true }).click()
    const board = page.getByRole('dialog', { name: 'Todos' })
    const lib = board.getByRole('listitem', { name: 'Library' })
    const bar = board.getByRole('toolbar', { name: 'Selected tasks' })
    await expect(bar).toHaveCount(0)

    // The box is hidden until a task is hovered, and there is no bar until one is picked.
    const box = lib.getByRole('checkbox', { name: 'Select alpha' })
    await expect(box).toHaveCSS('opacity', '0')
    await lib.getByRole('button', { name: 'Open alpha' }).hover()
    await expect(box).toHaveCSS('opacity', '1')
    await box.click()
    await expect(bar).toContainText('1 selected')
    // Shift-click picks the range between this and the last one clicked.
    await lib.getByRole('checkbox', { name: 'Select charlie' }).click({ modifiers: ['Shift'] })
    await expect(bar).toContainText('3 selected')
    if (process.env.SHOT) await board.screenshot({ path: `${process.env.SHOT}-bulk.png` })

    // The box at the top of a list picks all of it, and lets go of all of it.
    const all = lib.getByRole('checkbox', { name: 'Select all in Library' })
    await all.click()
    await expect(bar).toContainText('4 selected')
    await expect(all).toHaveAttribute('aria-checked', 'true')
    await all.click()
    await expect(bar).toHaveCount(0)

    // Esc lets go of the picked tasks and does not close the window.
    await lib.getByRole('checkbox', { name: 'Select alpha' }).click()
    await expect(bar).toContainText('1 selected')
    await page.keyboard.press('Escape')
    await expect(bar).toHaveCount(0)
    await expect(board).toBeVisible()

    // Move two to another list.
    await lib.getByRole('checkbox', { name: 'Select alpha' }).click()
    await lib.getByRole('checkbox', { name: 'Select bravo' }).click()
    await bar.getByRole('button', { name: /Move to/ }).click()
    await bar.getByRole('menuitem', { name: 'Chat' }).click()
    await expect(board.getByRole('listitem', { name: 'Chat' }).getByRole('button', { name: 'Open alpha' })).toBeVisible()
    await expect(board.getByRole('listitem', { name: 'Chat' }).getByRole('button', { name: 'Open bravo' })).toBeVisible()
    await expect(bar).toHaveCount(0)

    // Flag two as needing you, then finish them together.
    const chat = board.getByRole('listitem', { name: 'Chat' })
    await chat.getByRole('checkbox', { name: 'Select all in Chat' }).click()
    await expect(bar).toContainText('3 selected')
    await bar.getByRole('button', { name: 'Needs you' }).click()
    await expect(chat.getByText('needs you')).toHaveCount(3)
    await chat.getByRole('checkbox', { name: 'Select all in Chat' }).click()
    await bar.getByRole('button', { name: 'Mark done' }).click()
    await expect(chat.getByRole('button', { name: /Done \(3\)/ })).toBeVisible()

    // Delete asks once, with the count, and removes them.
    await lib.getByRole('checkbox', { name: 'Select all in Library' }).click()
    await bar.getByRole('button', { name: 'Delete' }).click()
    await page.getByRole('dialog').filter({ hasText: 'Delete 2 tasks?' }).getByRole('button', { name: 'Delete 2' }).click()
    await expect(board.getByRole('listitem', { name: 'Library' }).getByRole('button', { name: /^Open / })).toHaveCount(0)
  } finally {
    await shutdown()
  }
})

test('todos: a scratch pad is a checklist, a row per task with the list it goes to, that becomes tasks and can be undone', async () => {
  const { page, shutdown } = await open()
  try {
    await page.evaluate(async (f) => void (await window.aw.todos.addList(f, 'Chat')), (await page.evaluate(() => localStorage.getItem('aw.folder')))!)
    await page.locator('header').getByRole('button', { name: 'Todos', exact: true }).click()
    const board = page.getByRole('dialog', { name: 'Todos' })
    await board.getByRole('button', { name: 'Scratch pad' }).click()
    const pad = board.getByRole('region', { name: 'Scratch pad' })
    await expect(pad.getByRole('button', { name: 'Make 0 tasks' })).toBeDisabled()

    // Type a task, Enter for the next one: no text to edit, a row each.
    await pad.getByLabel('New pad task').fill('show the slip')
    await pad.getByLabel('New pad task').press('Enter')
    await page.keyboard.type('bulk select')
    await page.keyboard.press('Enter')
    await page.keyboard.type('rename the tab')
    await page.keyboard.press('Enter')
    // Backspace on the empty row goes back to the last one.
    await page.keyboard.press('Backspace')
    await expect(pad.getByLabel('Pad task 3')).toBeFocused()
    // Many lines pasted at once are many tasks (a bullet in front is dropped).
    await pad.getByLabel('New pad task').evaluate((el) => {
      const dt = new DataTransfer()
      dt.setData('text', '- [ ] pasted one\n* pasted two\n')
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
    })
    await expect(pad.getByLabel('Pad task 4')).toHaveValue('pasted one')
    await expect(pad.getByLabel('Pad task 5')).toHaveValue('pasted two')
    await expect(pad.getByRole('button', { name: 'Make 5 tasks' })).toBeEnabled()

    // Each row says where it goes: Inbox unless changed; the tick makes it a finished task.
    await expect(pad.getByRole('button', { name: 'List for show the slip: Inbox' })).toBeVisible()
    for (const t of ['show the slip', 'bulk select']) {
      await pad.getByRole('button', { name: new RegExp(`List for ${t}`) }).click()
      await pad.getByRole('menuitem', { name: 'Chat' }).click()
    }
    await pad.getByRole('button', { name: /List for rename the tab/ }).click()
    await pad.getByRole('menuitem', { name: 'New list…' }).click()
    await pad.getByLabel('New list name for this task').fill('Settings')
    await pad.getByLabel('New list name for this task').press('Enter')
    await pad.getByRole('checkbox', { name: 'Finished: rename the tab' }).click()
    if (process.env.SHOT) await board.screenshot({ path: `${process.env.SHOT}-padlist.png` })

    // Saved as typed: still there after leaving the tab.
    await board.getByRole('button', { name: 'Everyone' }).click()
    await board.getByRole('button', { name: 'Scratch pad' }).click()
    await expect(pad.getByLabel('Pad task 3')).toHaveValue('rename the tab')
    await expect(pad.getByRole('button', { name: 'List for show the slip: Chat' })).toBeVisible()

    await pad.getByRole('button', { name: 'Make 5 tasks' }).click()
    await expect(pad.getByRole('status')).toContainText('Made 5 tasks')
    await expect(pad.getByLabel('Pad task 1')).toHaveCount(0)
    await pad.getByRole('button', { name: 'Show the board' }).click()
    const chat = board.getByRole('listitem', { name: 'Chat' })
    await expect(chat.getByRole('button', { name: 'Open show the slip' })).toBeVisible()
    await expect(chat.getByRole('button', { name: 'Open bulk select' })).toBeVisible()
    await board.getByRole('listitem', { name: 'Settings' }).getByRole('button', { name: 'Open Settings' }).click()
    await board.getByRole('listitem', { name: 'Settings' }).getByRole('button', { name: /Done \(1\)/ }).click()
    await expect(board.getByRole('listitem', { name: 'Settings' }).getByRole('button', { name: 'Open rename the tab' })).toBeVisible()

    // Undo removes what it made and puts the rows back, lists and ticks as they were.
    await board.getByRole('button', { name: 'Scratch pad' }).click()
    await pad.getByRole('button', { name: 'Undo last' }).click()
    await expect(pad.getByRole('status')).toContainText('Took back 5 tasks')
    await expect(pad.getByLabel('Pad task 3')).toHaveValue('rename the tab')
    await expect(pad.getByRole('checkbox', { name: 'Finished: rename the tab' })).toHaveAttribute('aria-checked', 'true')
    await expect(pad.getByRole('button', { name: 'List for show the slip: Chat' })).toBeVisible()
  } finally {
    await shutdown()
  }
})
