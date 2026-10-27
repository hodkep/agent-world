import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { weekStartOf } from '../src/shared/ledger'
import { hire, launchApp } from './launch'

const open = async (page: import('@playwright/test').Page) => {
  await page.setViewportSize({ width: 1400, height: 1000 })
  await page.locator('header').getByRole('button', { name: 'Usage', exact: true }).click()
  return page.getByRole('dialog', { name: 'Usage and estimated costs' })
}

// Requests counted exactly, from two programs and an account, and some history from before they were: the Tokens tab says where it all went.
test('the Tokens tab shows where the tokens went, by program, account, agent, project and model, and says what a program does not report', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'aw-tokens-'))
  const home = join(tmp, 'home')
  mkdirSync(home, { recursive: true })
  writeFileSync(join(home, 'preferences.json'), JSON.stringify({ accounts: [{ id: 'work', name: 'Work', provider: 'claude' }] }))
  const h = (n: number) => Date.now() - n * 3_600_000
  const req = (t: number, o: object) => ({ k: 'req', t, project: 'checkout', model: 'claude-sonnet-5-5', provider: 'claude', ...o })
  const ev = [
    req(h(6), { agent: 'a', name: 'Charlie', account: 'work', input: 100, cacheRead: 800, cacheWrite: 100, output: 50 }),
    req(h(5), { agent: 'a', name: 'Charlie', account: 'work', input: 100, cacheRead: 1800, cacheWrite: 100, output: 50 }),
    req(h(4), { agent: 'b', name: 'Maya', project: 'web', input: 200, cacheRead: 400, cacheWrite: 0, output: 100 }),
    req(h(3), { agent: 'c', name: 'Scout', project: 'web', provider: 'agy', model: 'Gemini 3.8 Flash', input: 300, cacheRead: 700, output: 80 }),
    { k: 'tokens', t: h(100), agent: 'd', name: 'Olly', project: 'web', model: 'claude-opus-5-5', input: 1000, output: 200, provider: 'claude' }
  ]
  writeFileSync(join(home, 'ledger.jsonl'), ev.map((e) => JSON.stringify(e)).join('\n') + '\n')
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), AW_AGY_BIN: resolve(__dirname, 'fake-agy.mjs') }, tmp)
  try {
    const page = await app.firstWindow()
    const usage = await open(page)
    // The cache served 3,700 of the 4,600 tokens the exact requests read.
    await expect(usage.locator('.st-card', { hasText: 'Served from cache' })).toContainText('80%')
    await usage.getByRole('tab', { name: 'Tokens' }).click()
    await expect(usage.getByRole('heading', { name: /All, 30 days/ })).toContainText('6.1k tokens')
    const row = (name: RegExp) => usage.locator('.st-tokens tbody tr', { hasText: name })
    // By agent, the biggest first: Charlie 3.1k, the old history 1.2k, Scout 1.1k, Maya 700 (6.1k in all).
    await expect(usage.locator('.st-tokens tbody tr').first()).toContainText('Charlie')
    await expect(row(/Charlie/)).toContainText('2.6k')
    await expect(row(/Charlie/)).toContainText('87%')
    // agy never says what it wrote to its cache, and the history from before has no split at all.
    await expect(row(/Scout/).locator('td').nth(4)).toHaveText('—')
    await expect(row(/Olly/).locator('td').nth(6)).toHaveText('—')
    await expect(row(/Olly/).locator('.m-old')).toHaveCount(1)
    // The same tokens by program, by project and by model.
    await usage.getByRole('group', { name: 'Group by' }).getByRole('button', { name: 'Provider' }).click()
    await expect(usage.locator('.st-tokens tbody tr')).toHaveCount(2)
    await usage.getByRole('group', { name: 'Group by' }).getByRole('button', { name: 'Project' }).click()
    await expect(row(/checkout/)).toContainText('2.6k')
    await usage.getByRole('group', { name: 'Group by' }).getByRole('button', { name: 'Model' }).click()
    await expect(row(/Gemini 3.8 Flash/)).toContainText('300')
    // One account at a time narrows every grouping.
    await usage.getByRole('group', { name: 'Show' }).getByRole('button', { name: /Work/ }).click()
    await usage.getByRole('group', { name: 'Group by' }).getByRole('button', { name: 'Agent' }).click()
    await expect(usage.locator('.st-tokens tbody tr')).toHaveCount(1)
    await expect(usage.locator('.st-tokens tbody tr')).toContainText('Charlie')
    if (process.env.AW_SHOTS) await usage.screenshot({ path: `${process.env.AW_SHOTS}/usage-tokens.png` })
  } finally {
    await shutdown()
  }
})

// What Claude Code itself reports as it works: the app sets its OpenTelemetry export to its own server for every agent it starts.
test('a Claude agent\'s requests are counted exactly as it reports them, and once', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-tokens-live-'))
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_OTLP: '1' }, home)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page, { name: 'Ada' })
    const usage = await open(page)
    await usage.getByRole('tab', { name: 'Tokens' }).click()
    const ada = usage.locator('.st-tokens tbody tr', { hasText: 'Ada' })
    // The agent reports a moment after it starts; the window shows it once looked again (the refresh button).
    await expect(async () => {
      await usage.getByRole('button', { name: 'Refresh' }).click()
      // 800 + 900 read from the cache, 100 written to it.
      await expect(ada).toContainText('1.7k', { timeout: 1500 })
    }).toPass({ timeout: 30_000 })
    await expect(ada.locator('td').nth(4)).toHaveText('100')
    await usage.getByRole('tab', { name: 'Overview' }).click()
    await expect(usage.locator('.st-card', { hasText: 'Served from cache' })).toContainText('94%')
    // Closing and opening again gives the same: nothing was counted twice.
    await usage.getByRole('button', { name: 'Close' }).click()
    const again = await open(page)
    await again.getByRole('tab', { name: 'Tokens' }).click()
    await expect(again.locator('.st-tokens tbody tr', { hasText: 'Ada' }).locator('td').nth(3)).toHaveText('1.7k')
  } finally {
    await shutdown()
  }
})

// The Weekly Rewind says how the week's tokens compare with the week before, as it does for cost.
const rewind = async (lastWeek: object[]) => {
  const tmp = mkdtempSync(join(tmpdir(), 'aw-tokens-week-'))
  const home = join(tmp, 'home')
  mkdirSync(home, { recursive: true })
  writeFileSync(join(home, 'preferences.json'), JSON.stringify({ accounts: [{ id: 'work', name: 'Work', provider: 'claude' }] }))
  const now = Date.now()
  const monday = weekStartOf(now)
  // Inside this week whatever day and hour this runs, and in the week before it.
  const thisWeek = (n: number) => Math.min(now, monday + n * 1000)
  const before = (n: number) => monday - 2 * 86_400_000 + n * 1000
  const req = (t: number, o: object) => ({ k: 'req', t, project: 'checkout', model: 'claude-sonnet-5-5', provider: 'claude', ...o })
  const ev = [
    { k: 'cost', t: thisWeek(1), agent: 'a', project: 'checkout', model: 'claude-sonnet-5-5', usd: 4, provider: 'claude', name: 'Charlie', account: 'work' },
    { k: 'work', t: thisWeek(2), agent: 'a', project: 'checkout', ms: 3_600_000, provider: 'claude', name: 'Charlie', account: 'work' },
    req(thisWeek(3), { agent: 'a', name: 'Charlie', account: 'work', input: 100, cacheRead: 8000, cacheWrite: 400, output: 300 }),
    req(thisWeek(4), { agent: 'b', name: 'Maya', input: 50, cacheRead: 1000, cacheWrite: 0, output: 50 }),
    ...lastWeek.map((e, i) => ({ ...e, t: before(i) }))
  ]
  writeFileSync(join(home, 'ledger.jsonl'), ev.map((e) => JSON.stringify(e)).join('\n') + '\n')
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs') }, tmp)
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1400, height: 1000 })
  await page.locator('header').getByRole('button', { name: 'Weekly Rewind', exact: true }).click()
  return { shutdown, week: page.getByRole('dialog', { name: 'Weekly Rewind' }) }
}

test('the Weekly Rewind shows the week\'s rise or fall in tokens like cost, and compares without the cache when last week had none', async () => {
  // Last week was counted the old way: 1,200 of input and output, and no cache.
  const { shutdown, week } = await rewind([{ k: 'tokens', agent: 'a', project: 'checkout', model: 'claude-sonnet-5-5', input: 1000, output: 200, provider: 'claude', name: 'Charlie', account: 'work' }])
  try {
    const card = week.locator('.st-card', { hasText: /^Tokens/ })
    await expect(card).toContainText('9.9k')
    // This week's input and output are 500 against 1,200: a fall of 58%, said to be without the cache.
    await expect(card).toContainText('▼ 58%')
    await expect(card).toContainText('without cache')
    await expect(week.locator('.st-hero')).toContainText('tokens')
    await expect(week.locator('.st-hero')).toContainText('without cache')
    // The day chart can show tokens instead of dollars.
    await week.getByRole('group', { name: 'Measure' }).getByRole('button', { name: 'Tokens' }).click()
    await expect(week.getByRole('img', { name: /^Tokens by day/ })).toBeVisible()
    await week.getByRole('tab', { name: 'Accounts' }).click()
    const row = week.locator('.st-acct-table tbody tr', { hasText: 'Work' })
    await expect(row).toContainText('8.8k')
    await expect(row).toContainText('▼')
    if (process.env.AW_SHOTS) await week.screenshot({ path: `${process.env.AW_SHOTS}/rewind-tokens.png` })
  } finally {
    await shutdown()
  }
})

test('the Weekly Rewind compares everything, cache included, when last week was counted exactly, and says how much the cache served', async () => {
  const { shutdown, week } = await rewind([{ k: 'req', agent: 'a', project: 'checkout', model: 'claude-sonnet-5-5', provider: 'claude', name: 'Charlie', account: 'work', input: 100, cacheRead: 3000, cacheWrite: 100, output: 100 }])
  try {
    const card = week.locator('.st-card', { hasText: /^Tokens/ })
    // 9,900 against 3,300: up 200%, and 9,000 of the 9,550 read came from the cache.
    await expect(card).toContainText('▲ 200%')
    await expect(card).toContainText('94% served from cache')
    await expect(card).not.toContainText('without cache')
    await expect(card.locator('.st-mix')).toBeVisible()
  } finally {
    await shutdown()
  }
})
