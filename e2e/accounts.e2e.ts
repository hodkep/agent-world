import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp } from './launch'

test('a second account is signed in once, hired on, and an agent moves between accounts without signing in again', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-acct-')))
  const dir = join(tmp, 'proj')
  mkdirSync(dir)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: dir })
  const envLog = join(tmp, 'env.log')
  const { app, shutdown } = await launchApp(
    { AW_HOME: join(tmp, 'home'), AW_CLAUDE_PROJECTS: join(tmp, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '100', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_COST: '1.5', FAKE_USED_5H: '20', FAKE_USED_5H_WORK: '70', FAKE_ENV: envLog, HOME: tmp },
    tmp
  )
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1500, height: 900 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), dir)
    await page.reload()

    // With only this computer's login there is nothing to choose on the hire form.
    await page.locator('header').getByRole('button', { name: '+ Agent' }).click()
    await expect(page.getByRole('form', { name: 'Hire an agent' }).getByText('which login it runs on')).toHaveCount(0)
    await page.getByRole('form', { name: 'Hire an agent' }).getByRole('button', { name: 'Cancel' }).click()

    // Settings > Accounts: add one and sign in once, in its own terminal.
    await page.locator('header').getByRole('button', { name: 'Settings', exact: true }).click()
    const settings = page.getByRole('dialog', { name: 'Settings' })
    await settings.getByRole('tab', { name: 'Accounts' }).click()
    await expect(settings.getByText('The default account is used for every agent you hire.')).toBeVisible()
    await settings.getByRole('button', { name: 'Add account' }).click()
    await settings.getByLabel('Name').fill('Work')
    await settings.getByRole('button', { name: 'Continue to sign in' }).click()
    await expect.poll(() => existsSync(join(tmp, 'home', 'accounts', 'work', '.fake-login')), { timeout: 15_000 }).toBe(true)
    await settings.getByRole('button', { name: 'I have signed in: check' }).click()
    const row = settings.locator('.acct', { hasText: 'Work' })
    await expect(row).toContainText('work@example.com', { timeout: 15_000 })
    await expect(row).toContainText('Signed in')
    await settings.getByRole('button', { name: 'Make default' }).last().click()
    await expect(row).toContainText('Default for new agents')
    await expect.poll(() => JSON.parse(readFileSync(join(tmp, 'home', 'preferences.json'), 'utf8'))).toMatchObject({ accounts: [{ id: 'work', name: 'Work', provider: 'claude' }], defaults: { accounts: { claude: 'work' } } })
    await settings.getByRole('button', { name: 'Close settings' }).click()

    // A new agent starts on the default, in that account's folder.
    await page.locator('header').getByRole('button', { name: '+ Agent' }).click()
    const form = page.getByRole('form', { name: 'Hire an agent' })
    await expect(form.getByRole('radio', { name: 'Work' })).toBeChecked()
    await form.getByRole('button', { name: 'Hire' }).click()
    await form.waitFor({ state: 'detached' })
    const work = join(tmp, 'home', 'accounts', 'work')
    await expect.poll(() => (existsSync(envLog) ? readFileSync(envLog, 'utf8').trim().split('\n') : []), { timeout: 15_000 }).toEqual([work])
    await expect(page.locator('.agent-row .acct-dot')).toHaveAttribute('title', 'Runs on Work')

    // The spend it made is counted under Work as well as in the total.
    await page.locator('header').getByRole('button', { name: /^Usage/ }).click()
    const usage = page.getByRole('dialog', { name: /usage/i })
    const byAccount = usage.locator('section', { hasText: 'By account' })
    await expect(byAccount.locator('.st-rank', { hasText: 'Work' })).toContainText('$1.50', { timeout: 20_000 })
    await usage.getByRole('button', { name: /close/i }).first().click()

    // Its own controls show the allowance of the account it runs on.
    await page.getByRole('tab', { name: 'Chat' }).click()
    const ring = page.getByRole('button', { name: 'Context and usage' })
    const five = page.getByRole('dialog', { name: 'Usage' }).locator('.cb-meter', { hasText: '5-hour' })
    await ring.click()
    await expect(five).toContainText('30% left', { timeout: 20_000 })
    await ring.click()

    // From its profile card, move it to this computer's login: it restarts, with no sign-in step.
    await page.locator('.hc-name').click()
    const card = page.locator('.profile-overlay')
    await expect(card.getByText('Account', { exact: true })).toBeVisible()
    await expect(card.getByRole('button', { name: 'Account: Work' })).toBeEnabled({ timeout: 45_000 })
    await card.getByRole('button', { name: 'Account: Work' }).click()
    await card.getByRole('menuitemradio', { name: 'This computer' }).click()
    await expect.poll(() => readFileSync(envLog, 'utf8').trim().split('\n'), { timeout: 20_000 }).toEqual([work, '-'])
    await expect(page.locator('.agent-row .acct-dot')).toHaveAttribute('title', 'Runs on This computer')
    // ...and follows the switch at once.
    await ring.click()
    await expect(five).toContainText('80% left', { timeout: 20_000 })
    await ring.click()

    // Allowances are kept per login: each shows apart in the Usage tab, while the header shows the tightest of them.
    await expect(page.getByRole('status', { name: /5-hour limit: 30% left/ })).toBeVisible({ timeout: 20_000 })
    await page.locator('header').getByRole('button', { name: /^Usage/ }).click()
    const modal = page.getByRole('dialog', { name: /usage/i })
    await modal.getByRole('button', { name: 'Refresh' }).click()
    const limits = modal.locator('section', { hasText: 'live from the tanks' })
    await expect(limits.locator('.lm-login', { hasText: 'Work' })).toContainText('30% left', { timeout: 20_000 })
    await expect(limits.locator('.lm-login', { hasText: 'This computer' })).toContainText('80% left')
  } finally {
    await shutdown()
  }
})
