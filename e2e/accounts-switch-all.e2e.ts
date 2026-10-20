import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('Switch all agents here stops the working agents, moves everyone to the account and tells the stopped ones to continue', async () => {
  test.setTimeout(120_000)
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-swall-')))
  const dir = join(tmp, 'proj')
  mkdirSync(dir)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: dir })
  const envLog = join(tmp, 'env.log')
  // FAKE_BUSY: a message starts a turn that goes on until Esc, so that agent is working until it is stopped.
  const { app, shutdown } = await launchApp(
    { AW_HOME: join(tmp, 'home'), AW_CLAUDE_PROJECTS: join(tmp, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '100', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_BUSY: '1', FAKE_ENV: envLog },
    tmp
  )
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1500, height: 900 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), dir)
    await page.reload()
    await hire(page, { name: 'ada' })
    await hire(page, { name: 'bob' })

    // A second account, signed in once.
    await page.locator('header').getByRole('button', { name: 'Settings', exact: true }).click()
    const settings = page.getByRole('dialog', { name: 'Settings' })
    await settings.getByRole('tab', { name: 'Accounts' }).click()
    await settings.getByRole('button', { name: 'Add account' }).click()
    await settings.getByLabel('Name').fill('Work')
    await settings.getByRole('button', { name: 'Continue to sign in' }).click()
    await expect.poll(() => existsSync(join(tmp, 'home', 'accounts', 'work', '.fake-login')), { timeout: 15_000 }).toBe(true)
    await settings.getByRole('button', { name: 'I have signed in: check' }).click()
    const work = settings.locator('.acct', { hasText: 'Work' })
    await expect(work).toContainText('Signed in', { timeout: 15_000 })
    await settings.getByRole('button', { name: 'Close settings' }).click()

    // bob starts a turn that hangs: he is working. ada is idle.
    await page.locator('.roster button', { hasText: 'bob' }).click()
    await page.getByRole('tab', { name: 'Chat' }).click()
    const box = page.getByRole('textbox', { name: 'Message bob' })
    await box.fill('do something long')
    await box.press('Enter')
    await expect(page.getByRole('status').filter({ hasText: 'bob is' })).toBeVisible({ timeout: 15_000 })
    // The app's own record of what he is doing follows the agent's hook, a moment after the chat shows the message.
    await expect.poll(() => page.evaluate(() => window.aw.accountAgents().then((l) => l.find((a) => a.name === 'bob')?.activity)), { timeout: 15_000 }).not.toBe('idle')

    // The action is on the account's card, and its dialog says who will be stopped and who moves quietly.
    await page.locator('header').getByRole('button', { name: 'Settings', exact: true }).click()
    await settings.getByRole('tab', { name: 'Accounts' }).click()
    await work.getByRole('button', { name: 'Switch all agents here' }).click()
    const dialog = page.getByRole('dialog', { name: 'Switch all agents to Work' })
    await expect(dialog).toContainText('Switch 2 agents to Work?')
    await expect(dialog.getByText('Working now (1)')).toBeVisible()
    await expect(dialog.getByText('Idle or asleep (1)')).toBeVisible()
    await dialog.getByRole('button', { name: 'Stop them, switch and continue' }).click()
    await expect(dialog).toContainText('Switched 2 agents to Work', { timeout: 40_000 })
    await dialog.getByRole('button', { name: 'Done' }).click()

    // Both agents relaunched on Work, and the conversations carried on.
    const workDir = join(tmp, 'home', 'accounts', 'work')
    await expect.poll(() => readFileSync(envLog, 'utf8').trim().split('\n').filter((l) => l === workDir).length, { timeout: 30_000 }).toBe(2)
    await expect(work).toContainText('2 agents')

    // Only the one that was stopped was told to continue.
    await settings.getByRole('button', { name: 'Close settings' }).click()
    const log = page.getByRole('log', { name: /Conversation with bob/ })
    await expect(log.locator('.msg.user', { hasText: /^continue$|continue/ })).toHaveCount(1, { timeout: 30_000 })
    await page.locator('.roster button', { hasText: 'ada' }).click()
    await expect(page.getByRole('log', { name: /Conversation with ada/ }).locator('.msg.user', { hasText: 'continue' })).toHaveCount(0)
  } finally {
    await shutdown()
  }
})
