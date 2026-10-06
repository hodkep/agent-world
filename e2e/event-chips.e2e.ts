import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('system events in a conversation are small chips with their words in full: a monitor folds into one, trouble is red, and a chip opens to what it printed', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-events-')))
  const dir = join(tmp, 'proj')
  mkdirSync(dir)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: dir })
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_PROJECTS: join(tmp, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_EVENTS: '1' }, tmp)
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 900 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), dir)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const log = page.getByRole('log', { name: /Conversation with/ })
    // No grey pill is left: every event is a chip, in the groups they came in.
    await expect(log.locator('.ev-chip').first()).toBeVisible({ timeout: 20_000 })
    await expect(log.locator('.msg.note')).toHaveCount(0)
    // The monitor fired three times and is one chip: its name, the last thing it printed, and a count.
    const monitor = log.getByRole('button', { name: /Monitor: Wait for backend 8081/ })
    await expect(monitor).toHaveCount(1)
    await expect(monitor).toContainText('HTTP/1.1 200 OK')
    await expect(monitor).toContainText('3×')
    // The words are in full: the failed command is named whole, in red.
    const failed = log.locator('.ev-chip.bad')
    await expect(failed).toContainText('Background command "npm run e2e" failed with exit code 1')
    await expect(log.getByText('Interrupted')).toBeVisible()
    await expect(log.getByText('Set model to claude-sonnet-5-5')).toBeVisible()
    // One click opens everything the monitor printed, oldest first, with the trouble in red.
    await monitor.click()
    const drawer = log.locator('.ev-drawer')
    await expect(drawer.locator('.ev-line')).toHaveCount(3)
    await expect(drawer.locator('.ev-line').first()).toContainText('Failed to connect')
    await expect(drawer.locator('.ev-line.bad')).toHaveCount(1)
    await expect(drawer.locator('.ev-line.ok')).toHaveCount(1)
    // The agent's instruction that came with each event is not shown.
    await expect(log.getByText('PushNotification')).toHaveCount(0)
    if (process.env.AW_SHOTS) await log.screenshot({ path: `${process.env.AW_SHOTS}/event-chips.png` })
    await monitor.click()
    await expect(drawer).toHaveCount(0)
  } finally {
    await shutdown()
  }
})
