import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

const env = (home: string, children: string) => ({
  AW_HOME: join(home, 'aw'), AW_CLAUDE_PROJECTS: join(home, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '100', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_CHILD: children
})

test('running commands collapse to one line that opens a list, and each can be stopped', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-procs-'))
  const { app, shutdown } = await launchApp(env(home, '1'), home)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const button = page.getByRole('button', { name: '1 command running' })
    await expect(button).toBeVisible({ timeout: 10_000 })
    // Closed, it is a single line: the commands themselves are not on screen.
    await expect(page.getByRole('dialog', { name: 'Running processes' })).toHaveCount(0)
    await button.click()
    const list = page.getByRole('dialog', { name: 'Running processes' })
    await expect(list).toContainText('sleep')
    await expect(list).toContainText('300')
    // Each command says how long it has been running, and the time counts up while the list is open.
    const since = list.locator('.procs-since')
    await expect(since).toHaveText(/running\d+s/)
    const first = await since.innerText()
    await expect.poll(() => since.innerText(), { timeout: 5000 }).not.toBe(first)
    await list.getByRole('button', { name: /^Stop sleep/ }).click()
    await expect(button).toHaveCount(0, { timeout: 8_000 })
    await expect(list).toHaveCount(0)
  } finally {
    await shutdown()
  }
})

test('several running commands can all be stopped at once', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-procs-'))
  const { app, shutdown } = await launchApp(env(home, '3'), home)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const button = page.getByRole('button', { name: '3 commands running' })
    await expect(button).toBeVisible({ timeout: 10_000 })
    await button.click()
    const list = page.getByRole('dialog', { name: 'Running processes' })
    await expect(list.getByRole('listitem')).toHaveCount(3)
    await expect(list.locator('.procs-n')).toHaveText('3')
    await list.getByRole('button', { name: 'Stop all' }).click()
    await expect(button).toHaveCount(0, { timeout: 10_000 })
  } finally {
    await shutdown()
  }
})
