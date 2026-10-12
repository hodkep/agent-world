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
