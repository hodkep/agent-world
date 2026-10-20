import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp } from './launch'

test('an account can be renamed by clicking its name: Enter saves, Escape cancels, a name another account has is refused, and only the label changes', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-acctren-')))
  const home = join(tmp, 'home')
  mkdirSync(join(home, 'accounts', 'work'), { recursive: true })
  mkdirSync(join(home, 'accounts', 'home'), { recursive: true })
  const prefsFile = join(home, 'preferences.json')
  writeFileSync(prefsFile, JSON.stringify({ setup: { done: true, defaultProvider: 'claude' }, accounts: [{ id: 'work', name: 'Work', provider: 'claude' }, { id: 'home', name: 'Home', provider: 'claude' }] }))
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, tmp)
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1500, height: 900 })
    await page.locator('header').getByRole('button', { name: 'Settings', exact: true }).click()
    const settings = page.getByRole('dialog', { name: 'Settings' })
    await settings.getByRole('tab', { name: 'Accounts' }).click()
    // Your own login is not a label you chose, so it has nothing to rename.
    await expect(settings.getByRole('button', { name: 'Rename This computer' })).toHaveCount(0)

    // Escape leaves the name as it was.
    await settings.getByRole('button', { name: 'Rename Work' }).click()
    await settings.getByLabel('Name of Work').fill('Nonsense')
    await settings.getByLabel('Name of Work').press('Escape')
    await expect(settings.getByRole('button', { name: 'Rename Work' })).toBeVisible()
    expect(JSON.parse(readFileSync(prefsFile, 'utf8')).accounts[0].name).toBe('Work')

    // A name another account has is refused, and the field stays so it can be fixed.
    await settings.getByRole('button', { name: 'Rename Work' }).click()
    await settings.getByLabel('Name of Work').fill(' home ')
    await settings.getByLabel('Name of Work').press('Enter')
    await expect(settings.getByRole('alert')).toContainText('An account with that name exists.')
    await expect(settings.getByLabel('Name of Work')).toBeVisible()

    // Enter saves: the label changes everywhere, the id and folder do not.
    await settings.getByLabel('Name of Work').fill('Day job')
    await settings.getByLabel('Name of Work').press('Enter')
    await expect(settings.getByRole('button', { name: 'Rename Day job' })).toBeVisible()
    await expect(settings.locator('.acct', { hasText: 'Day job' })).toContainText('accounts/work')
    await expect.poll(() => JSON.parse(readFileSync(prefsFile, 'utf8')).accounts).toEqual([{ id: 'work', name: 'Day job', provider: 'claude' }, { id: 'home', name: 'Home', provider: 'claude' }])
  } finally {
    await shutdown()
  }
})
