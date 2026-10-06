import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('a question from the agent opens an 8-bit box, and the answers reach its menu', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-ask-'))
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_ASKQ: '1' }, home)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    const strip = page.locator('.ask-pill')
    await expect(strip).toContainText('question', { timeout: 15_000 })
    await strip.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('Favourite colour?')
    await dialog.getByRole('radio', { name: /Blue/ }).click()
    await expect(dialog).toContainText('Which pets?')
    await dialog.getByRole('checkbox', { name: /Cat/ }).click()
    await dialog.getByRole('checkbox', { name: /Fish/ }).click()
    await dialog.getByRole('button', { name: 'Review' }).click()
    // Each answer is a tag of its own on the review page.
    await expect(dialog.locator('.qd-review .tag')).toHaveText(['Blue', 'Cat', 'Fish'])
    await page.waitForTimeout(800)
    console.log('OPACITY', await dialog.evaluate((el) => getComputedStyle(el).opacity + ' ' + getComputedStyle(el).animationName))
    await page.screenshot({ path: 'test-results/ask-dialog.png' })
    await dialog.getByRole('button', { name: 'Send answers' }).click()
    await expect(dialog).toBeHidden({ timeout: 10_000 })
    await expect(page.locator('.term-host:visible')).toContainText('answers: Blue | Cat,Fish', { timeout: 10_000 })
  } finally {
    await shutdown()
  }
})

test('a window reload in the middle of a question brings the question back', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-ask-'))
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_ASKQ: '1' }, home)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    await expect(page.locator('.ask-pill')).toContainText('question', { timeout: 15_000 })
    await page.reload()
    const strip = page.locator('.ask-pill')
    await expect(strip).toContainText('question', { timeout: 10_000 })
    await strip.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('Favourite colour?')
    await dialog.getByRole('radio', { name: /Blue/ }).click()
    await dialog.getByRole('checkbox', { name: /Cat/ }).click()
    await dialog.getByRole('button', { name: 'Review' }).click()
    await dialog.getByRole('button', { name: 'Send answers' }).click()
    await expect(dialog).toBeHidden({ timeout: 10_000 })
    await page.getByRole('tab', { name: 'Terminal' }).click()
    await expect(page.locator('.term-host:visible')).toContainText('answers: Blue | Cat', { timeout: 10_000 })
  } finally {
    await shutdown()
  }
})
