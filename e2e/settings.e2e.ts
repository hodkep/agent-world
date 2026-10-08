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
    await dialog.getByRole('tab', { name: 'New agents' }).click()
    await dialog.getByLabel('Model for new agents').selectOption('claude|haiku')
    await dialog.getByLabel('Work in my folder directly (no branch)').check()
    await dialog.getByLabel('Levels of subagents').selectOption('3')
    await dialog.getByLabel('Subagents at once').selectOption('5')
    await expect.poll(() => JSON.parse(readFileSync(join(home, 'preferences.json'), 'utf8'))).toMatchObject({ notifications: 'attention', defaults: { model: 'haiku', inPlace: true }, subagents: { maxDepth: 3, maxRunning: 5 } })
    await dialog.getByRole('tab', { name: 'Updates' }).click()
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
    await dialog.getByRole('tab', { name: 'House rules' }).click()
    await dialog.getByLabel('Added to every agent').fill('Keep commits small.')
    await dialog.getByRole('tab', { name: 'Model by job' }).click()
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

test('on every Settings page the heading has room above it and sits close to the line of text under it', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-settings-gap-'))
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, home)
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 900 })
    await page.locator('header').getByRole('button', { name: 'Settings', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Settings' })
    const tabs = await dialog.getByRole('tab').all()
    expect(tabs.length).toBeGreaterThan(5)
    for (const tab of tabs) {
      await tab.click()
      const name = (await tab.textContent())?.trim()
      const m = await page.evaluate(() => {
        const pane = document.querySelector('.set-pane') as HTMLElement
        const head = (document.querySelector('.set-main > header, .settings-head') as HTMLElement).getBoundingClientRect()
        const lg = pane.querySelector('legend') as HTMLElement
        // The heading's own words, not the room around them.
        const r = document.createRange()
        r.selectNodeContents(lg)
        const words = r.getBoundingClientRect()
        const lead = (pane.querySelector('.set-lead') ?? [...pane.children].find((c) => c !== lg)) as HTMLElement
        return { above: Math.round(words.top - head.bottom), below: Math.round(lead.getBoundingClientRect().top - words.bottom) }
      })
      // Room above the heading (it used to touch the line under the title), and no wider a gap below than that.
      expect(m.above, `${name}: room above the heading`).toBeGreaterThanOrEqual(18)
      expect(m.below, `${name}: gap under the heading`).toBeLessThanOrEqual(16)
      expect(m.below, `${name}: gap under the heading`).toBeGreaterThanOrEqual(6)
    }
  } finally {
    await shutdown()
  }
})
