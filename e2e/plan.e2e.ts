import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { approve, hire, launchApp } from './launch'

test('a planning agent\'s plan is reviewed from the panel, and its tasks are listed', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-plan-'))
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_PLAN: '1' }, home)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    await approve(page)

    await page.locator('.ask-pill', { hasText: 'plan' }).click({ timeout: 15_000 })
    const card = page.getByRole('dialog')
    await expect(card.locator('.plan-md ol li').first()).toContainText('Create hello.txt with hi.', { timeout: 10_000 })
    // The plan is read in one piece: the card scrolls as a whole, not a small box inside it, and the buttons come after the text.
    const text = card.locator('.plan-md')
    // Markdown, not raw syntax: the numbered line is a list item.
    await expect(text.locator('ol li').first()).toContainText('Create hello.txt with hi.')
    const [t, b, f] = await Promise.all([text.boundingBox(), card.getByRole('button', { name: /Approve/ }).first().boundingBox(), card.getByRole('button', { name: 'Answer in terminal' }).boundingBox()])
    expect(b!.y).toBeGreaterThan(t!.y + t!.height - 1)
    expect(f!.y).toBeGreaterThan(t!.y + t!.height - 1)
    await expect(page.locator('.tasks')).toContainText('Write hello.txt')
    await expect(page.locator('.task.is-in_progress')).toContainText('Write hello.txt')

    await card.getByRole('button', { name: 'Approve · review each edit' }).click()
    await expect(page.locator('.term-host:visible')).toContainText('chose option 2', { timeout: 10_000 })
    await expect(card).toHaveCount(0)
  } finally {
    await shutdown()
  }
})

test('in the conversation the plan card also reads as one piece, with the buttons after the text', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-plan-'))
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_PLAN: '1' }, home)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    await approve(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const card = page.locator('.inline-need:visible')
    await expect(card.locator('.plan-md ol li').first()).toContainText('Create hello.txt with hi.', { timeout: 15_000 })
    // Only the card scrolls, and its buttons are reachable at the end of it.
    await expect(card.locator('.dialog-body')).toHaveCSS('overflow-y', 'visible')
    // The footer sits after the plan instead of floating over it.
    const [t, f] = await Promise.all([card.locator('.plan-md').boundingBox(), card.getByRole('button', { name: 'Answer in terminal' }).boundingBox()])
    expect(f!.y).toBeGreaterThan(t!.y + t!.height - 1)
    await card.getByRole('button', { name: 'Approve · review each edit' }).scrollIntoViewIfNeeded()
    await expect(card.getByRole('button', { name: 'Approve · review each edit' })).toBeInViewport()
  } finally {
    await shutdown()
  }
})

test('Reject plan does what Esc does in the terminal, and the card goes away', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-plan-'))
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_PLAN: '1' }, home)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    await approve(page)
    await page.locator('.ask-pill', { hasText: 'plan' }).click({ timeout: 15_000 })
    const card = page.getByRole('dialog')
    await expect(card.locator('.plan-md ol li').first()).toContainText('Create hello.txt with hi.', { timeout: 10_000 })
    await card.getByRole('button', { name: 'Reject plan' }).click()
    await expect(page.locator('.term-host:visible')).toContainText('plan rejected', { timeout: 10_000 })
    await expect(card).toHaveCount(0)
  } finally {
    await shutdown()
  }
})
