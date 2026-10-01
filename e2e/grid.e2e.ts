import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('the grid shows every agent with its terminal and opens the one you click', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'aw-grid-'))
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, tmp)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), tmp)
    await page.reload()
    await hire(page, { name: 'ada' })
    await hire(page, { name: 'linus' })
    await page.getByRole('button', { name: 'Grid', exact: true }).click()
    const list = page.getByRole('list', { name: 'All agents' })
    await expect(list.getByRole('listitem')).toHaveCount(2)
    await expect(list.getByRole('listitem').first()).toContainText('args:', { timeout: 10_000 })
    await list.getByRole('listitem', { name: /^ada/ }).click()
    await expect(page.locator('.hc-name')).toHaveText('ada')
    // In a narrow window the panel opens as a drawer over everything; a click outside closes it.
    if (await page.locator('.scrim').count()) await page.locator('.scrim').click({ position: { x: 5, y: 5 } })
    await page.getByRole('button', { name: 'Grid', exact: true }).click()
    await expect(list).toHaveCount(0)
  } finally {
    await shutdown()
  }
})

const pane = (page: import('@playwright/test').Page, name: string) => page.locator(`.pane[aria-label="${name}'s conversation"]`)

test('conversations can be laid out in the grid, filled by dragging agents in, and talked to there', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'aw-panes-'))
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_PROJECTS: join(tmp, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1' }, tmp)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), tmp)
    await page.reload()
    for (const name of ['ada', 'linus', 'grace']) await hire(page, { name })
    if (await page.locator('.scrim').count()) await page.locator('.scrim').click({ position: { x: 5, y: 5 } })
    await page.getByRole('button', { name: 'Grid', exact: true }).click()
    const bar = page.getByRole('toolbar', { name: 'Grid layout' })
    await bar.getByRole('button', { name: '2×1' }).click()
    // Two cells, filled with the first two agents.
    await expect(pane(page, 'ada')).toBeVisible()
    await expect(pane(page, 'linus')).toBeVisible()
    await expect(pane(page, 'grace')).toHaveCount(0)

    // Grow it, and drag grace from the list into an empty cell.
    await bar.getByRole('button', { name: '2×2' }).click()
    await expect(page.locator('.pane.empty')).toHaveCount(2)
    await page.locator('.roster button', { hasText: 'grace' }).dragTo(page.locator('.pane.empty').first())
    await expect(pane(page, 'grace')).toBeVisible()

    // Drag a cell's title onto another cell to swap them.
    const cellsBefore = await page.locator('.pane[aria-label$="conversation"]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
    await page.locator('.pane-head', { hasText: 'ada' }).dragTo(pane(page, 'linus'))
    const cellsAfter = await page.locator('.pane[aria-label$="conversation"]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
    expect(cellsAfter).not.toEqual(cellsBefore)

    // Talk to an agent right in its cell.
    const box = pane(page, 'linus').getByRole('textbox', { name: 'Message linus' })
    await box.fill('add a health check')
    await box.press('Enter')
    await expect(pane(page, 'linus').locator('.msg.assistant').last()).toContainText('health.ts', { timeout: 15_000 })

    // Take one out, and the layout is remembered.
    await page.getByRole('button', { name: 'Remove grace from the grid' }).click()
    await expect(pane(page, 'grace')).toHaveCount(0)
    await page.reload()
    await expect(pane(page, 'ada')).toBeVisible()
    await expect(pane(page, 'grace')).toHaveCount(0)
  } finally {
    await shutdown()
  }
})
