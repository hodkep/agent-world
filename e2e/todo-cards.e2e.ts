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

    // These tasks are not on this project's board, so the link says so rather than opening nothing.
    await expect(reply.locator('.todo-ref').first()).toContainText('not found')
  } finally {
    await shutdown()
  }
})
