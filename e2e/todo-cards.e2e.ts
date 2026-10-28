import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('chat: the todo tools have cards of their own, and a task named in a reply is a link', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-todo-cards-'))
  const { app, shutdown } = await launchApp(
    { AW_HOME: join(home, 'aw'), AW_USER_HOME: join(home, 'user'), AW_CLAUDE_PROJECTS: join(home, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '100', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_TODO: '1' },
    home
  )
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 1000 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    // The tasks the agent names are on the board, so their chips open them.
    for (let n = 1; n <= 14; n++) await page.evaluate(([f, i]) => window.aw.todos.add(f!, { title: `Task ${i}`, ...(i === '9' && { parent: '1' }) }), [home, String(n)])
    expect(await page.evaluate(async (f) => (await window.aw.todos.get(f)).board.todos.find((t) => t.id === '9')?.parent, home)).toBe('1')
    await page.getByRole('tab', { name: 'Chat' }).click()
    const box = page.getByRole('textbox', { name: 'Message ada' })
    await box.fill('keep the board up to date')
    await box.press('Enter')
    const log = page.getByRole('log', { name: 'Conversation with ada' })

    // The office's own calls are one quiet line, counted; a click opens a line for each call, and a click on one opens its card.
    const fold = log.locator('.of-head')
    await expect(fold).toHaveCount(1)
    await expect(fold).toHaveAttribute('aria-label', /Todos/)
    await expect(fold).toHaveAttribute('aria-label', /#9 claimed, blocked/)
    await expect(fold).toHaveAttribute('aria-label', /#14 done/)
    await expect(log.locator('[data-todo-card]')).toHaveCount(0)
    await expect(fold).toHaveAttribute('aria-expanded', 'false')
    expect((await fold.boundingBox())!.height).toBeLessThan(46) // a long line of todos wraps to two lines, no more
    await fold.click()
    await expect(log.locator('.of-row')).toHaveCount(5)
    // A call that touched one task carries its chip, so the board is a click away from the line (the list call has none).
    await expect(log.locator('.of-todo')).toHaveCount(4)
    await expect(log.locator('.of-todo').first()).toHaveText('todo#14 ↗')
    await log.locator('.of-todo').first().click()
    await expect(page.getByRole('dialog', { name: 'Todos' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Todos' })).toBeHidden()
    for (const row of await log.locator('.of-row').all()) await row.click()
    // Each button goes once it is used, so the first one left is always the next.
    for (let n = await log.locator('.of-details').count(); n > 0; n--) await log.locator('.of-details').first().click()
    const card = (kind: string) => log.locator(`[data-todo-card="${kind}"]`)
    await expect(card('add')).toContainText('Added todo')
    await expect(card('add')).toContainText('todo#14')
    await expect(card('add')).toContainText('needs you')
    await expect(card('add')).toContainText('to Manual setup')
    await expect(card('list')).toContainText('2 shown')
    await expect(card('list')).toContainText('Write the docs page')
    await expect(card('list')).toContainText('bob doing')
    await expect(card('claim')).toContainText('todo#9')
    await expect(card('update')).toContainText('Status')
    await expect(card('update')).toContainText('blocked')
    await expect(card('done')).toContainText('Marked done')
    await expect(card('done')).toContainText('Wrote the docs page.')

    // The reply names tasks: todo#14 and "todo #9" are links, and todo#99 in code stays plain.
    const reply = log.locator('.msg.assistant').filter({ hasText: 'All set' })
    await expect(reply.locator('.todo-ref')).toHaveCount(2)
    await expect(reply.locator('code')).toContainText('todo#99')
    await expect(reply.locator('code .todo-ref')).toHaveCount(0)

    // They are on the board, so the link names the task. A subtask's chip names its umbrella first, and a click on that number opens the umbrella.
    await expect(reply.locator('.todo-ref').first()).toContainText('Task 14')
    await expect(reply.locator('.todo-ref').nth(1)).toHaveText(/^todo#1›todo#9/)
    await expect(reply.locator('.todo-ref').first()).not.toContainText('›')
    await reply.locator('.todo-ref .todo-up').click()
    await expect(page.getByRole('dialog', { name: 'Todos' }).getByRole('complementary', { name: 'Task detail' }).getByLabel('Task title')).toHaveValue('Task 1')
    await page.keyboard.press('Escape')
  } finally {
    await shutdown()
  }
})

test('chat: a chip for a task that is not on the board any more is not a button, and says removed', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-todo-gone-'))
  const { app, shutdown } = await launchApp(
    { AW_HOME: join(home, 'aw'), AW_USER_HOME: join(home, 'user'), AW_CLAUDE_PROJECTS: join(home, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '100', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_TODO: '1' },
    home
  )
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 1000 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const box = page.getByRole('textbox', { name: 'Message ada' })
    await box.fill('keep the board up to date')
    await box.press('Enter')
    const log = page.getByRole('log', { name: 'Conversation with ada' })
    await log.locator('.of-head').click({ timeout: 15_000 })
    await expect(log.locator('.of-todo.gone').first()).toContainText('removed')
    await expect(log.locator('button.of-todo')).toHaveCount(0)
  } finally {
    await shutdown()
  }
})

test('every todo chip opens its task on the board, and a subtask chip opens the umbrella from its first number: in a reply, in a sent message, on a tool card, on the office line, and for a finished task', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-todo-chips-'))
  const { app, shutdown } = await launchApp(
    { AW_HOME: join(home, 'aw'), AW_USER_HOME: join(home, 'user'), AW_CLAUDE_PROJECTS: join(home, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '100', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_TODO: '1' },
    home
  )
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 1000 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    // Tasks 1..14; 9 is a part of 1.
    for (let n = 1; n <= 14; n++) await page.evaluate(([f, i]) => window.aw.todos.add(f!, { title: `Task ${i}`, ...(i === '9' && { parent: '1' }) }), [home, String(n)])
    await page.getByRole('tab', { name: 'Chat' }).click()
    const box = page.getByRole('textbox', { name: 'Message ada' })
    await box.fill('keep the board up to date')
    await box.press('Enter')
    const log = page.getByRole('log', { name: 'Conversation with ada' })
    const reply = log.locator('.msg.assistant').filter({ hasText: 'All set' })
    await expect(reply.locator('.todo-ref')).toHaveCount(2, { timeout: 30_000 })
    const board = page.getByRole('dialog', { name: 'Todos' })
    const openedOn = async (title: string) => {
      await expect(board.getByRole('complementary', { name: 'Task detail' }).getByLabel('Task title')).toHaveValue(title)
      await expect(board.locator('.td-task.sel, .td-task.has-open')).toHaveCount(1)
    }
    const close = async () => {
      await page.keyboard.press('Escape')
      await expect(board).toBeHidden()
    }
    // The board may have opened on its own for a task that needs you; the chips are clicked with it closed first.
    if (await board.isVisible()) await close()
    // A chip's click opens a modal over it, so the clicks here are dispatched (the handlers see the same event).
    // In a reply: the part's chip opens the part (its umbrella's card shown with the part's line marked); its first number opens the umbrella.
    const partChip = reply.locator('.todo-ref', { hasText: 'Task 9' })
    await partChip.locator('b').dispatchEvent('click')
    await openedOn('Task 9')
    await close()
    await partChip.locator('.todo-up').dispatchEvent('click')
    await openedOn('Task 1')
    // With the board already open, the other number still moves it.
    await partChip.locator('b').dispatchEvent('click')
    await openedOn('Task 9')
    await close()
    // In a message you sent, pasted as a quoted line.
    await box.fill('> please look at todo#9 and todo#14')
    await box.press('Enter')
    const mine = log.locator('.msg.user').filter({ hasText: 'please look at' })
    await expect(mine.locator('.todo-ref')).toHaveCount(2, { timeout: 30_000 })
    await mine.locator('.todo-ref', { hasText: 'Task 9' }).locator('.todo-up').dispatchEvent('click')
    await openedOn('Task 1')
    await close()
    await mine.locator('.todo-ref', { hasText: 'Task 14' }).dispatchEvent('click')
    await openedOn('Task 14')
    await close()
    // On the office line: the umbrella number before the part's, and the chip at the right.
    const fold = log.locator('.of-head')
    await fold.first().click()
    const row = log.locator('.of-line', { hasText: 'todo#9' }).first()
    await row.locator('.of-up').dispatchEvent('click')
    await openedOn('Task 1')
    await close()
    await row.locator('.of-todo').dispatchEvent('click')
    await openedOn('Task 9')
    await close()
    // On a tool card.
    for (const r of await log.locator('.of-row').all()) await r.click()
    for (let n = await log.locator('.of-details').count(); n > 0; n--) await log.locator('.of-details').first().click()
    const claim = log.locator('[data-todo-card="claim"]')
    await claim.locator('.todo-ref .todo-up').dispatchEvent('click')
    await openedOn('Task 1')
    await close()
    await claim.locator('.todo-ref b').dispatchEvent('click')
    await openedOn('Task 9')
    await close()
    // A finished umbrella: its chip still opens it, out of the folded Done section, marked.
    await page.evaluate((f) => window.aw.todos.done(f, '1'), home)
    await expect(partChip.locator('.s.done')).toHaveCount(1)
    await partChip.locator('.todo-up').dispatchEvent('click')
    await openedOn('Task 1')
    await expect(board.locator('.td-task.sel')).toBeInViewport()
  } finally {
    await shutdown()
  }
})
