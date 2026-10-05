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
    // The side panel is showing linus (hired last), so he is left out of the grid and only ada is in it.
    await expect(list.getByRole('listitem')).toHaveCount(1)
    await expect(list.getByRole('listitem', { name: /^ada/ })).toBeVisible()
    // The tile shows the end of what the agent's terminal printed (the launch text is long and wraps), not the placeholder.
    await expect(list.getByRole('listitem').first().locator('pre')).not.toHaveText('…', { timeout: 10_000 })
    await list.getByRole('listitem', { name: /^ada/ }).click()
    await expect(page.locator('.hc-name')).toHaveText('ada')
    // Now the panel shows ada: she is out of the grid and linus is back in it.
    await expect(list.getByRole('listitem', { name: /^linus/ })).toBeVisible()
    await expect(list.getByRole('listitem', { name: /^ada/ })).toHaveCount(0)
    // In a narrow window the panel opens as a drawer over everything; a click outside closes it.
    if (await page.locator('.scrim').count()) await page.locator('.scrim').click({ position: { x: 5, y: 5 } })
    await page.getByRole('button', { name: 'Grid', exact: true }).click()
    await expect(list).toHaveCount(0)
  } finally {
    await shutdown()
  }
})

/** The tiles share the whole area between them: no gaps beyond the margins, nothing left empty. */
async function expectFilled(page: import('@playwright/test').Page) {
  const area = (await page.locator('.panes').boundingBox())!
  const boxes = await page.locator('.pane').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => r.width * r.height))
  const covered = boxes.reduce((a, b) => a + b, 0) / (area.width * area.height)
  expect(covered).toBeGreaterThan(0.9)
}

const pane = (page: import('@playwright/test').Page, name: string) => page.locator(`.pane[aria-label="${name}'s conversation"]`)

test('conversations are added to the grid from the list on the left, and the grid fits itself to them', async () => {
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
    await bar.getByRole('button', { name: 'Conversations' }).click()
    // No presets: it starts with the conversation you were in (the last one hired, grace), and the list on the left holds everything that can join it.
    await expect(bar.getByRole('button', { name: /^\d×\d$/ })).toHaveCount(0)
    await expect(page.locator('.pane')).toHaveCount(1)
    await expect(pane(page, 'grace')).toBeVisible()
    const side = page.getByRole('complementary', { name: 'Agents and terminals to add' })
    await expect(side.getByRole('button', { name: /^Terminal/ })).toBeVisible()
    for (const name of ['ada', 'linus', 'grace']) await expect(side.getByRole('button', { name: new RegExp(`^${name}`) })).toBeVisible()

    // Click one in, drag another in: the grid grows with no empty cell.
    await side.getByRole('button', { name: /^linus/ }).click()
    await expect(page.locator('.pane')).toHaveCount(2)
    await side.getByRole('button', { name: /^ada/ }).dragTo(page.locator('.panes'))
    await expect(page.locator('.pane')).toHaveCount(3)
    await expectFilled(page)
    for (const name of ['ada', 'linus', 'grace']) await expect(pane(page, name)).toBeVisible()

    // Drag a pane's title onto another to move it.
    const order = () => page.locator('.pane[aria-label$="conversation"]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
    const before = await order()
    await page.locator('.pane-head', { hasText: 'ada' }).dragTo(pane(page, 'grace'), { targetPosition: { x: 20, y: 100 } })
    expect(await order()).not.toEqual(before)

    // Talk to an agent right in its pane.
    const box = pane(page, 'linus').getByRole('textbox', { name: 'Message linus' })
    await box.fill('add a health check')
    await box.press('Enter')
    await expect(pane(page, 'linus').locator('.msg.assistant').last()).toContainText('health.ts', { timeout: 15_000 })

    // Take one out: the others fill the space, and the arrangement is remembered.
    await page.getByRole('button', { name: 'Remove grace from the grid' }).click()
    await expect(pane(page, 'grace')).toHaveCount(0)
    await expect(page.locator('.pane')).toHaveCount(2)
    await expectFilled(page)
    await page.reload()
    await expect(pane(page, 'ada')).toBeVisible()
    await expect(pane(page, 'grace')).toHaveCount(0)
    // The one in the list that is not in the grid can still be added.
    await expect(side).toBeVisible()
  } finally {
    await shutdown()
  }
})
