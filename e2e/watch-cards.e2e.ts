import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('a monitor and scheduled tasks are cards that say what they wait for, with what the monitor printed on its own card', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'aw-watch-'))
  const dir = join(tmp, 'proj')
  mkdirSync(dir)
  const { app, shutdown } = await launchApp(
    { AW_HOME: join(tmp, 'home'), AW_CLAUDE_PROJECTS: join(tmp, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_WATCH: '1' },
    tmp
  )
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1500, height: 1100 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), dir)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const log = page.getByRole('log', { name: 'Conversation with ada' })

    // The monitor: what it waits for, its task, how it ended, and the lines it printed, all on one card.
    const mon = log.getByRole('article', { name: /^Monitor: Wait for the restarted backend/ })
    await expect(mon).toBeVisible({ timeout: 15_000 })
    await expect(mon).toContainText('bnfx5vv1z')
    await expect(mon.locator('.state')).toHaveText('Ended')
    await expect(mon.locator('.log li')).toHaveCount(2)
    await expect(mon.locator('.log li.good')).toContainText('HTTP/1.1 200 OK — backend up on :8081')
    await expect(mon.locator('.log li.bad')).toContainText('Failed to connect')
    await expect(mon.locator('.cmd .t')).toContainText('until curl')
    await expect(log).not.toContainText('"timeout_ms"')
    // Its firings are not also chips of their own, and the end of the task is not a line anywhere else.
    await expect(log.locator('.ev-chip')).toHaveCount(0)

    // The wake-up: a time and how long until then, not seconds and milliseconds.
    const wake = log.getByRole('article', { name: /^Scheduled: Check whether the CI run/ })
    await expect(wake.locator('.state')).toHaveText('Waiting')
    await expect(wake).toContainText(/(Today|Tomorrow) at \d\d:\d\d/)
    await expect(wake).toContainText(/in 2[45] min/)
    await expect(wake).toContainText('/loop check CI for aw/csr-1')
    await expect(log).not.toContainText('"delaySeconds"')

    // A repeating job, in words with the next time; and one that was cancelled afterwards.
    const daily = log.getByRole('article', { name: /^Scheduled: Summarise what changed on main overnight/ })
    await expect(daily.locator('.state')).toHaveText('Repeats')
    await expect(daily).toContainText('every weekday at 09:00')
    await expect(daily).toContainText(/Next: (today|\w{3}) 09:00/)
    const hourly = log.getByRole('article', { name: /^Scheduled: Hourly check of the build/ })
    await expect(hourly.locator('.state')).toHaveText('Cancelled')
    await expect(hourly).toContainText('every hour at :07')
    await expect(log).toContainText('Cancelled the schedule ee99ff00')

    // What is still armed is a chip beside "subagents working": one monitor (the other ended) and two schedules (the third was cancelled).
    page.on('dialog', (d) => void d.accept())
    const mons = page.getByRole('button', { name: '1 monitor watching' })
    await expect(mons).toBeVisible()
    await expect(page.getByRole('button', { name: '2 scheduled' })).toBeVisible()
    await mons.click()
    const list = page.getByRole('dialog', { name: 'Watching and waiting' })
    await expect(list.locator('.wl-i.monitor')).toHaveCount(1)
    await expect(list.locator('.wl-i.monitor')).toContainText('Watch the build log for errors')
    await expect(list.locator('.wl-i.monitor')).toContainText('fired 1×')
    await expect(list.locator('.wl-i.schedule')).toHaveCount(2)
    await expect(list).not.toContainText('Hourly check of the build')
    // Only the agent can cancel one, so it is asked.
    await list.locator('.wl-i.monitor').getByRole('button', { name: /^Ask ada to cancel it/ }).click()
    await expect(log).toContainText('Please stop the monitor wb77q1', { timeout: 10_000 })
    // An item takes you to its card, and the list closes.
    await expect(list).toBeVisible()
    await list.locator('.wl-i.schedule').first().locator('.wl-jump').click()
    await expect(page.getByRole('dialog', { name: 'Watching and waiting' })).toHaveCount(0)
  } finally {
    await shutdown()
  }
})
