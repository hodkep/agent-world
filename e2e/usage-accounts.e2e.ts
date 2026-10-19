import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp } from './launch'
import { weekStartOf } from '../src/shared/ledger'

// A week of history on three accounts: the computer's own login, Work, and agy.
test('Usage and Weekly Rewind show each account with its program, spend, limits and week', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'aw-usage-accounts-'))
  const home = join(tmp, 'home')
  mkdirSync(home, { recursive: true })
  writeFileSync(join(home, 'preferences.json'), JSON.stringify({ accounts: [{ id: 'work', name: 'Work', provider: 'claude' }] }))
  const now = Date.now()
  // The Weekly Rewind shows the calendar week, so the seeded history must lie inside it whatever day and hour this runs: on a Monday morning
  // 'thirty hours ago' is last week. Each event sits a second after the one 'hours' before it, from the start of this week, in the same order as before.
  const weekStart = weekStartOf(now)
  const hrs = (h: number) => Math.min(now, weekStart + (30 - h) * 1000 + 1)
  const ev = [
    { k: 'cost', t: hrs(30), agent: 'a', project: 'checkout', model: 'Opus 5.5', usd: 12, provider: 'claude', name: 'Charlie', account: 'work' },
    { k: 'cost', t: hrs(5), agent: 'a', project: 'checkout', model: 'Opus 5.5', usd: 8, provider: 'claude', name: 'Charlie', account: 'work' },
    { k: 'cost', t: hrs(4), agent: 'b', project: 'web', model: 'Sonnet 5.5', usd: 3, provider: 'claude', name: 'Maya' },
    { k: 'tokens', t: hrs(3), agent: 'c', project: 'web', model: 'Gemini 3.8 Flash', input: 90_000, output: 10_000, provider: 'agy', name: 'Scout' },
    { k: 'work', t: hrs(30), agent: 'a', project: 'checkout', ms: 5_400_000, provider: 'claude', name: 'Charlie', account: 'work' },
    { k: 'work', t: hrs(5), agent: 'a', project: 'checkout', ms: 3_600_000, provider: 'claude', name: 'Charlie', account: 'work' },
    { k: 'work', t: hrs(4), agent: 'b', project: 'web', ms: 1_800_000, provider: 'claude', name: 'Maya' },
    { k: 'limit', t: hrs(30), provider: 'claude', account: 'work', group: 'Claude Code', kind: 'weekly', usedPct: 60 },
    { k: 'limit', t: hrs(4), provider: 'claude', account: 'work', group: 'Claude Code', kind: 'weekly', usedPct: 88 },
    { k: 'limit', t: hrs(6), provider: 'claude', account: 'work', group: 'Claude Code', kind: 'five_hour', usedPct: 97 }
  ]
  writeFileSync(join(home, 'ledger.jsonl'), ev.map((e) => JSON.stringify(e)).join('\n') + '\n')
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), AW_AGY_BIN: resolve(__dirname, 'fake-agy.mjs') }, tmp)
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 1000 })
    await page.locator('header').getByRole('button', { name: 'Usage', exact: true }).click()
    const usage = page.getByRole('dialog', { name: 'Usage and estimated costs' })
    await expect(usage.locator('.st-card', { hasText: 'Spent, 30 days' })).toContainText('$23.00')
    // Every account is a chip with its program's logo; a program that keeps no accounts is named after itself.
    const scope = usage.getByRole('group', { name: 'Show' })
    for (const n of ['Work', 'This computer', 'agy']) await expect(scope.getByRole('button', { name: new RegExp(n) })).toBeVisible()
    await expect(scope.locator('img').first()).toBeVisible()
    if (process.env.AW_SHOTS) await usage.screenshot({ path: `${process.env.AW_SHOTS}/usage-overview.png` })
    // The month's pace is a number, and each account has a line about what it is doing.
    await expect(usage.locator('.st-card', { hasText: 'This month' })).toContainText('$')
    await expect(usage.locator('.st-insight').first()).toBeVisible()
    // One account at a time: the total follows.
    await scope.getByRole('button', { name: /Work/ }).click()
    await expect(usage.locator('.st-card', { hasText: 'Spent, 30 days' })).toContainText('$20.00')
    await scope.getByRole('button', { name: 'All' }).click()
    // The Accounts tab lists them side by side and opens one.
    await usage.getByRole('tab', { name: 'Accounts' }).click()
    const row = usage.locator('.st-acct-table tbody tr', { hasText: 'Work' })
    await expect(row).toContainText('$20.00')
    await expect(row).toContainText('Opus 5.5')
    await row.click()
    await expect(usage.getByRole('region', { name: 'Work in detail' })).toContainText('Charlie')
    if (process.env.AW_SHOTS) await usage.screenshot({ path: `${process.env.AW_SHOTS}/usage-accounts.png` })
    await usage.getByRole('tab', { name: 'Projects' }).click()
    await expect(usage.locator('.st-proj', { hasText: 'checkout' }).locator('.st-split b')).toHaveCount(1)
    await usage.getByRole('button', { name: 'Close' }).first().click()

    await page.locator('header').getByRole('button', { name: 'Weekly Rewind', exact: true }).click()
    const week = page.getByRole('dialog', { name: 'Weekly Rewind' })
    await expect(week.locator('.st-cards .st-card', { hasText: 'Cost' })).toContainText('$')
    await expect(week.locator('.st-highlights .st-card', { hasText: 'Longest stretch' })).toContainText('1h 30m')
    await expect(week.locator('.st-highlights .st-card', { hasText: 'Priciest turn' })).toContainText('$12.00')
    await expect(week.locator('.st-highlights .st-card', { hasText: 'Most pushed' })).toContainText('88%')
    if (process.env.AW_SHOTS) await week.screenshot({ path: `${process.env.AW_SHOTS}/rewind-week.png` })
    await week.getByRole('tab', { name: 'Accounts' }).click()
    await expect(week.locator('.st-acct-table tbody tr', { hasText: 'Work' })).toContainText('88%')
    await expect(week.locator('.st-acct-table tbody tr', { hasText: 'Work' })).toContainText('1')
    if (process.env.AW_SHOTS) await week.screenshot({ path: `${process.env.AW_SHOTS}/rewind-accounts.png` })
    await week.getByRole('tab', { name: 'Projects & agents' }).click()
    await expect(week.getByText('Charlie')).toBeVisible()
  } finally {
    await shutdown()
  }
})
