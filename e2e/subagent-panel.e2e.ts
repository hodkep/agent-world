import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('a subagent opens as a conversation in a panel to the right of the chat: the chat keeps its width and the office gives up the room', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'aw-subpanel-'))
  const dir = join(tmp, 'proj')
  mkdirSync(dir)
  const { app, shutdown } = await launchApp(
    { AW_HOME: join(tmp, 'home'), AW_CLAUDE_PROJECTS: join(tmp, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_DELEGATE: '2', FAKE_DELEGATE_HOLD: '1', FAKE_DELEGATE_MS: '700' },
    tmp
  )
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1600, height: 1000 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), dir)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const chat = page.locator('aside')
    const stage = page.locator('.stage')
    await expect(page.getByRole('button', { name: /subagents? working/ })).toBeVisible({ timeout: 20_000 })
    const before = { chat: (await chat.boundingBox())!.width, stage: (await stage.boundingBox())!.width }
    await expect(page.getByRole('complementary', { name: 'Subagents' })).toHaveCount(0)

    // Open the list of subagents, one of them, and its conversation.
    await page.getByRole('button', { name: /subagents? working/ }).click()
    const list = page.getByRole('dialog', { name: 'Subagents' })
    await expect(list.locator('.dg-row')).toHaveCount(2, { timeout: 20_000 })
    // Clicking a subagent opens its conversation at once; Details shows its calls in the list instead.
    await list.locator('.dg-row').first().getByRole('button', { name: 'Details' }).click()
    await expect(list.locator('.dg-row').first().locator('.dg-open')).toBeVisible()
    await list.locator('.dg-row').first().locator('.dg-line').click()
    await page.keyboard.press('Escape')

    const panel = page.getByRole('complementary', { name: 'Subagents' })
    await expect(panel).toBeVisible()
    // Its own words and calls, in the cards of the chat: the task it was given, its calls, and its answer.
    const log = panel.getByRole('log')
    await expect(log).toContainText('go', { timeout: 15_000 })
    await expect(log).toContainText('Part 1 is fine.', { timeout: 15_000 })
    await expect(panel.getByRole('tab', { name: /Look into part 1/ })).toHaveAttribute('aria-selected', 'true')
    await expect(panel.locator('.sp-pill')).toHaveText('DONE')

    // The chat is as wide as it was; the office is narrower by the panel's width.
    const after = { chat: (await chat.boundingBox())!.width, stage: (await stage.boundingBox())!.width }
    const sub = (await panel.boundingBox())!
    expect(Math.abs(after.chat - before.chat)).toBeLessThan(2)
    expect(before.stage - after.stage).toBeGreaterThan(sub.width - 4)
    expect((await panel.boundingBox())!.x).toBeGreaterThan((await chat.boundingBox())!.x)

    // Its left edge is dragged to resize it: wider when dragged left, the chat keeps its width, the width is remembered, and a double click resets it.
    const grip = panel.getByRole('separator', { name: 'Resize the subagents panel' })
    const wide0 = (await panel.boundingBox())!.width
    const gb = (await grip.boundingBox())!
    await page.mouse.move(gb.x + gb.width / 2, gb.y + 200)
    await page.mouse.down()
    await page.mouse.move(gb.x + gb.width / 2 - 120, gb.y + 200, { steps: 6 })
    await page.mouse.up()
    await expect.poll(async () => Math.round((await panel.boundingBox())!.width)).toBeGreaterThan(wide0 + 100)
    expect(Math.abs((await chat.boundingBox())!.width - before.chat)).toBeLessThan(2)
    expect(Number(await page.evaluate(() => localStorage.getItem('aw.subw')))).toBeGreaterThan(wide0 + 100)
    await grip.dblclick()
    await expect.poll(async () => Math.abs((await panel.boundingBox())!.width - wide0)).toBeLessThan(2)

    // A second subagent gets a tab beside the first, and closing both closes the panel.
    await page.getByRole('button', { name: /subagents? working/ }).click()
    await list.locator('.dg-row').nth(1).locator('.dg-line').click()
    await page.keyboard.press('Escape')
    await expect(panel.getByRole('tab')).toHaveCount(2)
    await expect(panel.locator('.sp-pill')).toHaveText('WORKING')
    await expect(panel.getByRole('log')).toContainText('part2', { timeout: 15_000 })
    await panel.getByRole('button', { name: /^Close Look into part/ }).first().click()
    await expect(panel.getByRole('tab')).toHaveCount(1)
    await panel.getByRole('button', { name: 'Close the subagents panel' }).click()
    await expect(panel).toHaveCount(0)
    await expect.poll(async () => Math.abs((await stage.boundingBox())!.width - before.stage)).toBeLessThan(2)

    // From the top bar, for any agent: clicking a subagent selects that agent and opens its panel.
    await page.locator('header').getByRole('button', { name: /^Subagents/ }).click()
    const everyone = page.getByRole('dialog', { name: 'Subagents' })
    await everyone.locator('.dg-row').first().locator('.dg-line').click()
    await expect(everyone).toHaveCount(0)
    await expect(page.getByRole('complementary', { name: 'Subagents' })).toBeVisible()
  } finally {
    await shutdown()
  }
})
