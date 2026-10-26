import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp } from './launch'

test('a signed-out login of this computer is signed in from Settings and Accounts, in the same terminal an added account uses', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-ownsign-')))
  const home = join(tmp, 'home')
  // One account is signed in, so the app is ready and the login of this computer is the one that waits.
  mkdirSync(join(home, 'accounts', 'work'), { recursive: true })
  writeFileSync(join(home, 'accounts', 'work', '.fake-login'), 'work@example.com')
  writeFileSync(join(home, 'preferences.json'), JSON.stringify({ accounts: [{ id: 'work', name: 'Work', provider: 'claude' }], defaults: { accounts: { claude: 'work' } }, setup: { done: true } }))
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_OWN_SIGNED_OUT: '1', HOME: tmp }, tmp)
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1500, height: 900 })
    await page.reload()
    await page.locator('header').getByRole('button', { name: 'Settings', exact: true }).click()
    const settings = page.getByRole('dialog', { name: 'Settings' })
    await settings.getByRole('tab', { name: /Accounts/ }).click()
    const row = settings.locator('.acct', { hasText: 'This computer' })
    await expect(row).toContainText('Sign in needed')
    // The tag that says it is the way in.
    await row.getByRole('button', { name: 'Sign in' }).click()
    await expect(settings.locator('.acct-add .set-lead')).toContainText('Signing in This computer')
    await expect(settings.getByRole('button', { name: 'I have signed in: check' })).toBeVisible()
    await expect(settings.locator('.su-term')).toBeVisible()
  } finally {
    await shutdown()
  }
})
