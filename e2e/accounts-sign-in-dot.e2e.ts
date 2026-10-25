import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp } from './launch'

// The computer's own login is signed out, one account is signed in and another is not.
test('a program with a signed-in account is ready, and Settings and Accounts carry a dot while a login still needs signing in', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-dot-')))
  const home = join(tmp, 'home')
  mkdirSync(join(home, 'accounts', 'work'), { recursive: true })
  mkdirSync(join(home, 'accounts', 'spare'), { recursive: true })
  writeFileSync(join(home, 'accounts', 'work', '.fake-login'), 'work@example.com')
  writeFileSync(join(home, 'preferences.json'), JSON.stringify({ accounts: [{ id: 'work', name: 'Work', provider: 'claude' }, { id: 'spare', name: 'Spare', provider: 'claude' }], defaults: { accounts: { claude: 'work' } }, setup: { done: true } }))
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_OWN_SIGNED_OUT: '1', HOME: tmp }, tmp)
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1500, height: 900 })
    await page.reload()

    // Claude is ready through its signed-in account, though this computer's own login is not.
    await expect.poll(async () => (await page.evaluate(() => window.aw.listProviders())).find((p) => p.id === 'claude')?.detection.state).toBe('ready')

    // Two logins are not signed in (this computer's and Spare): the dot is on Settings and on Accounts.
    const gear = page.locator('header').getByRole('button', { name: 'Settings', exact: true })
    await expect(gear.getByTestId('gear-dot')).toBeVisible()
    await gear.click()
    const settings = page.getByRole('dialog', { name: 'Settings' })
    await expect(settings.getByRole('tab', { name: /Accounts/ }).getByTestId('accounts-dot')).toBeVisible()
    await settings.getByRole('tab', { name: /Accounts/ }).click()
    await expect(settings.locator('.acct', { hasText: 'Spare' })).toContainText('Sign in needed')

    // Signing the account in (here, its login file appearing) takes that dot off once the list is read again; this computer's login still waits.
    writeFileSync(join(home, 'accounts', 'spare', '.fake-login'), 'spare@example.com')
    await settings.getByRole('button', { name: 'Close settings' }).click()
    await gear.click()
    await settings.getByRole('tab', { name: /Accounts/ }).click()
    await expect(settings.locator('.acct', { hasText: 'Spare' })).toContainText('Signed in')
    await expect(settings.locator('.acct', { hasText: 'This computer' })).toContainText('Sign in needed')
    await expect(settings.getByRole('tab', { name: /Accounts/ }).getByTestId('accounts-dot')).toBeVisible()
  } finally {
    await shutdown()
  }
})
