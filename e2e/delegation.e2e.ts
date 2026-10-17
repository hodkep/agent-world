import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

async function chat(env: Record<string, string>) {
  const tmp = mkdtempSync(join(tmpdir(), 'aw-deleg-'))
  const dir = join(tmp, 'proj')
  mkdirSync(dir)
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_PROJECTS: join(tmp, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', ...env }, tmp)
  const page = await app.firstWindow()
  await page.evaluate((f) => localStorage.setItem('aw.folder', f), dir)
  await page.reload()
  await hire(page)
  await page.getByRole('tab', { name: 'Chat' }).click()
  return { page, shutdown }
}

test('subagents started in one reply are one card, with a row for each, its calls and its answer', async () => {
  const { page, shutdown } = await chat({ FAKE_DELEGATE: '3', FAKE_DELEGATE_MS: '700' })
  try {
    const card = page.getByRole('region', { name: 'Delegated to 3 subagents' })
    await expect(card).toBeVisible({ timeout: 15_000 })
    const rows = card.locator('.dg-row')
    await expect(rows).toHaveCount(3)
    await expect(rows.nth(0)).toContainText('Look into part 1')
    await expect(rows.nth(0)).toContainText('Explore')
    await expect(rows.nth(1)).toContainText('Plan')
    // While they run it says so, and the bar has a segment each.
    await expect(card).toContainText('working', { timeout: 15_000 })
    await expect(card.locator('.dg-seg i')).toHaveCount(3)
    // When all have answered the card folds to its header, and opens again on request.
    await expect(card).toContainText('3 done', { timeout: 30_000 })
    await expect(card.getByRole('button', { name: 'Show 3 results' })).toBeVisible()
    await expect(rows).toHaveCount(0)
    await card.getByRole('button', { name: 'Show 3 results' }).click()
    await expect(rows).toHaveCount(3)
    // A row opens to every call it made, and its answer.
    await rows.nth(0).getByRole('button', { name: 'Details' }).click()
    const open = rows.nth(0).locator('.dg-open')
    await expect(open.locator('.dg-call')).toHaveCount(3)
    await expect(open).toContainText('Grep')
    await expect(open).toContainText('part1.ts')
    await expect(open).toContainText('Part 1 is fine.')
  } finally {
    await shutdown()
  }
})

test('a subagent still working shows its latest call, and the others show as done', async () => {
  const { page, shutdown } = await chat({ FAKE_DELEGATE: '3', FAKE_DELEGATE_MS: '300', FAKE_DELEGATE_HOLD: '1' })
  try {
    const card = page.getByRole('region', { name: 'Delegated to 3 subagents' })
    await expect(card).toContainText('2 done', { timeout: 20_000 })
    await expect(card).toContainText('1 working')
    await expect(card.locator('.dg-row.s-working .dg-now')).toContainText('Glob **/*.ts')
    await expect(card.locator('.dg-seg i.s-done')).toHaveCount(2)
    await expect(card.getByRole('button', { name: 'Hide' })).toBeVisible()
  } finally {
    await shutdown()
  }
})

test('subagents that report by hand-back finish the card and leave a report card each, with no raw notices', async () => {
  const { page, shutdown } = await chat({ FAKE_DELEGATE: '3', FAKE_DELEGATE_MS: '300', FAKE_DELEGATE_HANDBACK: '1' })
  try {
    const card = page.getByRole('region', { name: 'Delegated to 3 subagents' })
    // Handing the report back is the end: the card says done, and the hand-back call is not listed as work.
    await expect(card).toContainText('3 done', { timeout: 30_000 })
    await card.getByRole('button', { name: 'Show 3 results' }).click()
    await card.locator('.dg-row').nth(0).getByRole('button', { name: 'Details' }).click()
    await expect(card.locator('.dg-open .dg-call')).toHaveCount(3)
    await expect(card.locator('.dg-open')).not.toContainText('SubagentHandback')
    await expect(card.locator('.dg-open')).toContainText('Part 1 is fine.')
    // Each report is a card of its own in the conversation, named for the task, folded to a few lines.
    const reports = page.getByRole('article', { name: /^Message from agent/ })
    await expect(reports).toHaveCount(3)
    await expect(reports.first()).toContainText('Report from')
    await expect(reports.first()).toContainText('Look into part 1')
    await expect(reports.first()).toContainText('Part 1 is fine.')
    // The notices that a task ended are not shown as something you said.
    await expect(page.getByRole('log').getByText('task-notification')).toHaveCount(0)
  } finally {
    await shutdown()
  }
})
