import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp } from './launch'

test('settings are saved as you change them and set what a new agent starts with', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-settings-'))
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, home)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await page.locator('header').getByRole('button', { name: 'Settings', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Settings' })
    await dialog.getByLabel('Notifications').selectOption('attention')
    await dialog.getByLabel('Model for new agents').selectOption('claude|haiku')
    await dialog.getByLabel('Work in my folder directly (no branch)').check()
    await expect.poll(() => JSON.parse(readFileSync(join(home, 'preferences.json'), 'utf8'))).toMatchObject({ notifications: 'attention', defaults: { model: 'haiku', inPlace: true } })
    await dialog.getByRole('button', { name: 'Check now' }).click()
    await expect(dialog.getByRole('status')).toContainText('only work in the installed app')
    await dialog.getByRole('button', { name: 'Close settings' }).click()

    await page.locator('header').getByRole('button', { name: '+ Agent' }).click()
    const form = page.getByRole('form', { name: 'Hire an agent' })
    await expect(form.getByLabel('Model')).toHaveValue('haiku')
    await expect(form.getByLabel('Work in my folder directly (no branch)')).toBeChecked()
  } finally {
    await shutdown()
  }
})

test('house rules are saved, and a job\'s model choice fills the hire form', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-rules-'))
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, home)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await page.locator('header').getByRole('button', { name: 'Settings', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Settings' })
    await dialog.getByLabel('Added to every agent').fill('Keep commits small.')
    await dialog.getByLabel('Model for Reviewer').selectOption('claude|haiku')
    await expect.poll(() => JSON.parse(readFileSync(join(home, 'preferences.json'), 'utf8'))).toMatchObject({ houseRules: 'Keep commits small.', roleModels: { Reviewer: 'haiku' } })
    await dialog.getByRole('button', { name: 'Close settings' }).click()
    await page.locator('header').getByRole('button', { name: '+ Agent' }).click()
    const form = page.getByRole('form', { name: 'Hire an agent' })
    await form.getByLabel('Role').selectOption({ label: 'Reviewer' })
    await expect(form.getByLabel('Model')).toHaveValue('haiku')
  } finally {
    await shutdown()
  }
})
