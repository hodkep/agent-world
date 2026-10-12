import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp } from './launch'

test('workflows are off until switched on: Settings has the switch and its cost, the top bar gets a Workflows button, and off takes it away again', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-wfsw-'))
  const project = join(home, 'project')
  mkdirSync(project)
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, home)
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 1000 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), project)
    await page.reload()
    const bar = page.locator('header')
    await expect(bar.getByRole('button', { name: 'Usage' })).toBeVisible()
    await expect(bar.getByRole('button', { name: 'Workflows' })).toHaveCount(0)

    await bar.getByRole('button', { name: 'Settings', exact: true }).click()
    const settings = page.getByRole('dialog', { name: 'Settings' })
    await settings.getByRole('tab', { name: 'Features' }).click()
    const sw = settings.getByRole('switch', { name: /^Workflows/ })
    await expect(sw).not.toBeChecked()
    const cost = settings.getByRole('table', { name: 'What workflows add per task' })
    // Two numbers per level: what lands in the agent's context, and what a separate model call uses.
    await expect(cost.getByRole('row', { name: /Economy/ })).toContainText('≈ 750 tokens')
    await expect(cost.getByRole('row', { name: /Economy/ })).toContainText('none')
    await expect(cost.getByRole('row', { name: /Balanced/ })).toContainText('≈ 1,000 tokens')
    await expect(cost.getByRole('row', { name: /Balanced/ })).toContainText('≈ 4,000 tokens')
    await expect(cost.getByRole('row', { name: /Balanced/ })).toContainText('$0.0004')
    await expect(settings.getByText('A plan every time. A small model (haiku) audits the branch against it.')).toBeVisible()

    await sw.click()
    await expect(sw).toBeChecked()
    await settings.getByRole('radio', { name: 'Max' }).click()
    await expect(cost.getByRole('row', { name: /Max/ })).toContainText('≈ 6,000 tokens')
    await expect(settings.getByText('audited by a larger model (sonnet)')).toBeVisible()
    await expect(cost.getByRole('row', { name: /Max/ })).toHaveAttribute('aria-current', 'true')
    await settings.getByRole('button', { name: 'Close' }).click()

    await expect(bar.getByRole('button', { name: 'Workflows' })).toBeVisible()
    await bar.getByRole('button', { name: 'Workflows' }).click()
    const win = page.getByRole('dialog', { name: 'Workflows' })
    await expect(win).toContainText('No runs yet')
    await win.getByRole('button', { name: 'Close' }).click()

    // It survives a restart of the page, and off takes the button away again.
    await page.reload()
    await expect(bar.getByRole('button', { name: 'Workflows' })).toBeVisible()
    await bar.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByRole('dialog', { name: 'Settings' }).getByRole('tab', { name: 'Features' }).click()
    const again = page.getByRole('dialog', { name: 'Settings' }).getByRole('switch', { name: /^Workflows/ })
    await expect(again).toBeChecked()
    await again.click()
    await page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: 'Close' }).click()
    await expect(bar.getByRole('button', { name: 'Workflows' })).toHaveCount(0)
  } finally {
    await shutdown()
  }
})

test('the Features step of first-run setup offers Workflows with its cost, and the choice carries into the app', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-wfsu-'))
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), AW_NO_SETUP: '', FAKE_DELAY_MS: '50' }, home)
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 1000 })
    const setup = page.getByRole('dialog', { name: 'First-run setup' })
    await setup.getByRole('button', { name: 'Continue' }).click()
    await setup.getByRole('button', { name: 'Continue' }).click()
    await setup.getByRole('button', { name: 'Skip for now' }).click()
    await setup.getByRole('button', { name: 'Continue' }).click()
    const sw = setup.getByRole('switch', { name: /^Workflows/ })
    await expect(sw).toHaveAttribute('aria-checked', 'false')
    await expect(setup.getByRole('table', { name: 'What workflows add per task' })).toContainText('≈ 750 tokens')
    await sw.click()
    await expect(sw).toHaveAttribute('aria-checked', 'true')
    await setup.getByRole('button', { name: 'Skip for now' }).click()
    await setup.getByRole('button', { name: 'Skip for now' }).click().catch(() => undefined)
    await expect(page.locator('header').getByRole('button', { name: 'Workflows' })).toBeVisible()
  } finally {
    await shutdown()
  }
})
