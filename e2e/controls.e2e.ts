import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { approve, chatTab, hire, launchApp } from './launch'

test('hire with options, see live cost and context, get a budget warning, switch model by relaunching the session', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-ctl-'))
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_COST: '0.9' }, home)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page, { name: 'nova', model: 'sonnet', budget: '1', instructions: 'Prefer small commits.' })

    const term = page.locator('.term-host:visible')
    await expect(term).toContainText('--model sonnet')
    await expect(term).toContainText('Prefer small commits.')
    await expect(term).toContainText('status bar: Agent World · Sonnet · context 42% · $0.90')

    const row = page.locator('.roster button', { hasText: 'nova' })
    await expect(row).toContainText('$0.90')
    await expect(row).toHaveClass(/budget-near/)
    await chatTab(page)
    await page.getByRole('button', { name: 'Context and usage' }).click()
    await expect(page.getByRole('dialog', { name: 'Usage' })).toContainText('58% left')
    await expect(page.getByRole('dialog', { name: 'Usage' })).toContainText('$0.90 / $1.00')
    await page.keyboard.press('Escape')
    await page.getByRole('tab', { name: 'Terminal' }).click()

    await approve(page)
    await chatTab(page)
    await page.getByRole('button', { name: 'Model and effort' }).click()
    await expect(page.getByRole('menuitemradio', { name: 'Opus' })).toBeEnabled({ timeout: 10_000 })
    await page.getByRole('menuitemradio', { name: 'Opus' }).click()
    await page.getByRole('tab', { name: 'Terminal' }).click()
    // Relaunched in the same session with the new flag; no global /model, and the agent never leaves.
    await expect(term).toContainText('--model opus')
    await expect(term).not.toContainText('/model opus')
    await expect(row).toBeVisible()
    await page.waitForTimeout(1500)
    await expect(row).not.toContainText('asleep')
  } finally {
    await shutdown()
  }
})
