import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { hire, launchApp } from './launch'

// "Switch all agents" moves the agents three at a time: relaunching all at once swamped a computer with a big office.
async function office(count: number) {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-batches-')))
  const dir = join(tmp, 'proj')
  mkdirSync(dir)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: dir })
  // FAKE_START_MS: each relaunched agent takes a while to show its input box, as Claude does on a busy machine.
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_PROJECTS: join(tmp, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '100', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_START_MS: '1500' }, tmp)
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1500, height: 1000 })
  await page.evaluate((f) => localStorage.setItem('aw.folder', f), dir)
  await page.reload()
  for (let i = 0; i < count; i++) await hire(page, { name: `a${i}` })
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
  await page.locator('header').getByRole('button', { name: 'Settings', exact: true }).click()
  await settings.getByRole('tab', { name: 'Accounts' }).click()
  await work.getByRole('button', { name: 'Switch all agents here' }).click()
  const dialog = page.getByRole('dialog', { name: 'Switch all agents to Work' })
  return { page, dialog, shutdown }
}

/** The most agents that said "starting" at one moment, watched from the page while the dialog runs. */
const watchStarting = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __peak: number }
    w.__peak = 0
    setInterval(() => (w.__peak = Math.max(w.__peak, [...document.querySelectorAll('.swa-row .swa-chip')].filter((c) => c.textContent === 'starting').length)), 25)
  })
const peak = (page: Page) => page.evaluate(() => (window as unknown as { __peak: number }).__peak)
const onWork = (page: Page) => page.evaluate(() => window.aw.accountAgents().then((l) => l.filter((a) => a.account === 'work').length))

test('Switch all agents starts three at a time, says which group it is on, and ends with every agent on the account', async () => {
  test.setTimeout(180_000)
  const { page, dialog, shutdown } = await office(7)
  try {
    await expect(dialog).toContainText('Switch 7 agents to Work?')
    // More than three move, so the dialog says how: in groups of three.
    await expect(dialog).toContainText('They start 3 at a time')
    await watchStarting(page)
    await dialog.getByRole('button', { name: 'Switch 7 agents' }).click()
    await expect(dialog.locator('.swa-cap')).toContainText('starting up to 3 at a time', { timeout: 15_000 })
    await expect(dialog).toContainText('Switched 7 agents to Work', { timeout: 90_000 })
    // Never more than three starting at once, and three did at some moment (not one by one).
    expect(await peak(page)).toBe(3)
    expect(await onWork(page)).toBe(7)
  } finally {
    await shutdown()
  }
})

test('Stop after these leaves the agents that had not begun on their old account, and says so', async () => {
  test.setTimeout(180_000)
  const { page, dialog, shutdown } = await office(7)
  try {
    await dialog.getByRole('button', { name: 'Switch 7 agents' }).click()
    await expect(dialog.locator('.swa-row .swa-chip', { hasText: 'starting' }).first()).toBeVisible({ timeout: 15_000 })
    await dialog.getByRole('button', { name: 'Stop after these' }).click()
    await expect(dialog).toContainText('Switched 3 of 7 agents to Work', { timeout: 60_000 })
    await expect(dialog.locator('.swa-row', { hasText: 'left on its old account' })).toHaveCount(4)
    expect(await onWork(page)).toBe(3)
    // Look again offers the rest.
    await dialog.getByRole('button', { name: 'Look again' }).click()
    await expect(dialog).toContainText('Switch 4 agents to Work?')
  } finally {
    await shutdown()
  }
})
