import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

async function start(extra: Record<string, string> = {}) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'aw-usage-')))
  const dir = join(home, 'proj')
  mkdirSync(dir)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: dir })
  const run = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_PROJECTS: join(home, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '100', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', ...extra }, home)
  const page = await run.app.firstWindow()
  await page.evaluate((f) => localStorage.setItem('aw.folder', f), dir)
  await page.reload()
  return { ...run, page }
}

test('the usage pop-up offers Compact, which sends /compact to the agent', async () => {
  const { page, shutdown } = await start({ FAKE_LONG: '3' })
  try {
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const log = page.getByRole('log', { name: 'Conversation with ada' })
    await expect(log.getByText('old message 2')).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: 'Context and usage' }).click()
    const usage = page.getByRole('dialog', { name: 'Usage' })
    const compact = usage.getByRole('button', { name: 'Compact' })
    await expect(compact).toBeVisible()
    await expect(compact).toBeEnabled({ timeout: 10_000 })
    await compact.click()
    // The pop-up closes and the command lands in the conversation like any message.
    await expect(usage).toHaveCount(0)
    await expect(log.locator('.msg.user', { hasText: '/compact' })).toBeVisible({ timeout: 10_000 })
  } finally {
    await shutdown()
  }
})

test('/clear empties the conversation at once, without waiting for the new session', async () => {
  const { page, shutdown } = await start({ FAKE_LONG: '6' })
  try {
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const log = page.getByRole('log', { name: 'Conversation with ada' })
    await expect(log.getByText('old message 5')).toBeVisible({ timeout: 10_000 })
    const box = page.getByRole('textbox', { name: /^Message/ })
    await box.fill('/clear')
    await box.press('Enter')
    // Well inside the half minute it used to take: nothing of the old conversation is left, and the command itself is not shown as a message.
    await expect(log.getByText('old message 5')).toHaveCount(0, { timeout: 3_000 })
    await expect(log.locator('.msg')).toHaveCount(0)
    await page.waitForTimeout(1500)
    await expect(log.locator('.msg')).toHaveCount(0)
    await expect(log).toContainText('Say something to ada')
  } finally {
    await shutdown()
  }
})
